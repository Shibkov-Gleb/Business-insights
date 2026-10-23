import { Router } from "express";
import { z } from "zod";
import { db, json } from "@context/db";
import {
  organizationInput,
  profileInput,
  invitationInput,
} from "@context/contracts";
import {
  access,
  authenticated,
  audit,
  fail,
  hash,
  id,
  list,
  pagination,
  profile,
  token,
  newSession,
} from "./core.ts";
import { config } from "@context/config";
export const organizations = Router();
organizations.get("/", async (req, res) => {
  const userId = authenticated(req),
    members = await db.membership.findMany({ where: { userId } });
  const rows = await db.organization.findMany({
    where: { id: { in: members.map((x) => x.orgId) } },
    ...pagination(req),
    orderBy: { id: "asc" },
  });
  res.json(
    list(
      rows.map((o) => ({
        ...o,
        membership: members.find((m) => m.orgId === o.id),
      })),
    ),
  );
});
organizations.post("/", async (req, res) => {
  const userId = authenticated(req),
    input = organizationInput.parse(req.body);
  const org = await db.$transaction(async (tx) => {
    const o = await tx.organization.create({ data: input });
    await tx.membership.create({
      data: { orgId: o.id, userId, role: "owner" },
    });
    await tx.analysisScope.create({
      data: { orgId: o.id, name: "Общий обзор", isDefault: true },
    });
    await tx.profileVersion.create({
      data: {
        orgId: o.id,
        version: 1,
        createdBy: userId,
        fields: json({
          description: {
            value: input.description,
            origin: "user",
            assertion: "confirmed",
            date: new Date().toISOString(),
            confirmedBy: userId,
          },
        }),
      },
    });
    return o;
  });
  res.status(201).json(org);
});
organizations.get("/:orgId", async (req, res) => {
  await access(authenticated(req), id(req, "orgId"));
  res.json(
    await db.organization.findUniqueOrThrow({
      where: { id: id(req, "orgId") },
    }),
  );
});
organizations.patch("/:orgId", async (req, res) => {
  const orgId = id(req, "orgId");
  await access(authenticated(req), orgId, null, false, true);
  res.json(
    await db.organization.update({
      where: { id: orgId },
      data: organizationInput.partial().parse(req.body),
    }),
  );
});
organizations.get("/:orgId/scopes", async (req, res) => {
  const orgId = id(req, "orgId"),
    m = await access(authenticated(req), orgId);
  res.json(
    list(
      await db.analysisScope.findMany({
        where: {
          orgId,
          ...(!m.allScopes && !["owner", "admin"].includes(m.role)
            ? { id: { in: m.scopeIds } }
            : {}),
        },
        orderBy: { id: "asc" },
      }),
    ),
  );
});
organizations.post("/:orgId/scopes", async (req, res) => {
  const orgId = id(req, "orgId");
  await access(authenticated(req), orgId, null, false, true);
  res.status(201).json(
    await db.analysisScope.create({
      data: { orgId, name: z.string().min(2).max(120).parse(req.body.name) },
    }),
  );
});
organizations.get("/:orgId/scopes/:scopeId", async (req, res) => {
  await access(authenticated(req), id(req, "orgId"), id(req, "scopeId"));
  res.json(
    await db.analysisScope.findUniqueOrThrow({
      where: { id: id(req, "scopeId") },
    }),
  );
});
organizations.patch("/:orgId/scopes/:scopeId", async (req, res) => {
  await access(authenticated(req), id(req, "orgId"), id(req, "scopeId"), true);
  const input = z
    .object({
      name: z.string().min(2).optional(),
      settings: z
        .object({
          rss: z.array(z.url()).max(20).optional(),
          blockedDomains: z.array(z.string()).max(100).optional(),
          keywords: z.array(z.string()).max(30).optional(),
        })
        .optional(),
    })
    .parse(req.body);
  res.json(
    await db.analysisScope.update({
      where: { id: id(req, "scopeId") },
      data: input,
    }),
  );
});
for (const scoped of [false, true]) {
  const path = scoped ? "/:orgId/scopes/:scopeId/profile" : "/:orgId/profile";
  organizations.get(path, async (req, res) => {
    const orgId = id(req, "orgId"),
      scopeId = scoped ? id(req, "scopeId") : null;
    await access(authenticated(req), orgId, scopeId);
    res.json({
      current: await profile(orgId, scopeId),
      history: await db.profileVersion.findMany({
        where: { orgId, scopeId },
        orderBy: { version: "desc" },
        take: 20,
      }),
    });
  });
  organizations.patch(path, async (req, res) => {
    const orgId = id(req, "orgId"),
      scopeId = scoped ? id(req, "scopeId") : null,
      userId = authenticated(req);
    await access(userId, orgId, scopeId, true, !scoped);
    const input = profileInput.parse(req.body);
    const result = await saveProfile(
      userId,
      orgId,
      scopeId,
      input.expectedVersion,
      input.fields,
    );
    res.json(result);
  });
  const proposals = scoped
    ? "/:orgId/scopes/:scopeId/profile-proposals"
    : "/:orgId/profile-proposals";
  organizations.get(proposals, async (req, res) => {
    const orgId = id(req, "orgId"),
      scopeId = scoped ? id(req, "scopeId") : null;
    await access(authenticated(req), orgId, scopeId);
    res.json(
      list(
        await db.profileProposal.findMany({
          where: { orgId, scopeId, status: "proposed" },
          orderBy: { id: "asc" },
        }),
      ),
    );
  });
  organizations.post(proposals, async (req, res) => {
    const orgId = id(req, "orgId"),
      scopeId = scoped ? id(req, "scopeId") : null;
    await access(authenticated(req), orgId, scopeId, true, !scoped);
    const input = profileInput.parse(req.body);
    res.status(201).json(
      await db.profileProposal.create({
        data: {
          orgId,
          scopeId,
          expectedVersion: input.expectedVersion,
          fields: json(input.fields),
        },
      }),
    );
  });
  organizations.post(proposals + "/:proposalId/confirm", async (req, res) => {
    const orgId = id(req, "orgId"),
      scopeId = scoped ? id(req, "scopeId") : null,
      userId = authenticated(req);
    await access(userId, orgId, scopeId, true, !scoped);
    const p = await db.profileProposal.findFirst({
      where: { id: id(req, "proposalId"), orgId, scopeId, status: "proposed" },
    });
    if (!p) fail(404, "NOT_FOUND", "Предложение не найдено");
    const input = profileInput.parse(req.body);
    if (p!.documentId) {
      const d = await db.document.findUnique({ where: { id: p!.documentId } });
      if (!d || d.status === "deleted")
        fail(409, "SOURCE_DELETED", "Исходный документ удалён");
    }
    const result = await saveProfile(
      userId,
      orgId,
      scopeId,
      input.expectedVersion,
      input.fields,
      p!.id,
    );
    res.json(result);
  });
}
export async function saveProfile(
  userId: string,
  orgId: string,
  scopeId: string | null,
  expectedVersion: number,
  fields: Record<string, unknown>,
  proposalId?: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scopeId || orgId}))`;
    const current = await tx.profileVersion.findFirst({
      where: { orgId, scopeId },
      orderBy: { version: "desc" },
    });
    if ((current?.version || 0) !== expectedVersion)
      fail(
        409,
        "VERSION_CONFLICT",
        "Профиль изменён. Сравните версии и повторите выбор",
      );
    const normalized = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => {
        const fact =
          v && typeof v === "object" && !Array.isArray(v)
            ? (v as Record<string, unknown>)
            : { value: v };
        return [
          k,
          {
            ...fact,
            origin: fact.origin || "user",
            assertion: fact.assertion || "confirmed",
            date: new Date().toISOString(),
            confirmedBy: userId,
          },
        ];
      }),
    );
    const result = await tx.profileVersion.create({
      data: {
        orgId,
        scopeId,
        version: expectedVersion + 1,
        createdBy: userId,
        fields: json({ ...(current?.fields as object), ...normalized }),
      },
    });
    if (proposalId)
      await tx.profileProposal.update({
        where: { id: proposalId },
        data: { status: "confirmed" },
      });
    return result;
  });
}
organizations.get("/:orgId/members", async (req, res) => {
  const orgId = id(req, "orgId");
  await access(authenticated(req), orgId, null, false, true);
  const rows = await db.membership.findMany({ where: { orgId } });
  res.json(
    list(
      await Promise.all(
        rows.map(async (m) => ({
          ...m,
          email: (
            await db.user.findUnique({
              where: { id: m.userId },
              select: { email: true },
            })
          )?.email,
        })),
      ),
    ),
  );
});
organizations.patch("/:orgId/members/:memberId", async (req, res) => {
  const orgId = id(req, "orgId"),
    userId = authenticated(req),
    actor = await access(userId, orgId),
    target = await db.membership.findFirst({
      where: { id: id(req, "memberId"), orgId },
    });
  if (!target) fail(404, "NOT_FOUND", "Участник не найден");
  const input = z
    .object({
      role: z.enum(["admin", "analyst", "reader"]).optional(),
      allScopes: z.boolean().optional(),
      scopeIds: z.array(z.uuid()).optional(),
      workRole: z
        .enum([
          "founder",
          "finance",
          "sales",
          "marketing",
          "procurement",
          "product",
          "operations",
          "other",
        ])
        .optional(),
      interests: z.array(z.string()).optional(),
    })
    .parse(req.body);
  const privileges =
    input.role !== undefined ||
    input.allScopes !== undefined ||
    input.scopeIds !== undefined;
  if (privileges) {
    if (!["owner", "admin"].includes(actor.role) || target!.role === "owner")
      fail(403, "FORBIDDEN", "Используйте передачу владения");
    if (input.scopeIds) await validateScopes(orgId, input.scopeIds);
  } else if (
    target!.userId !== userId &&
    !["owner", "admin"].includes(actor.role)
  )
    fail(403, "FORBIDDEN", "Недостаточно прав");
  res.json(
    await db.membership.update({ where: { id: target!.id }, data: input }),
  );
  if (privileges)
    await db.session.deleteMany({ where: { userId: target!.userId } });
  await audit(userId, orgId, "membership.updated", {
    membershipId: target!.id,
  });
});
organizations.get("/:orgId/members/:memberId", async (req, res) => {
  const orgId = id(req, "orgId"),
    actor = await access(authenticated(req), orgId);
  const member = await db.membership.findFirst({
    where: { id: id(req, "memberId"), orgId },
  });
  if (
    !member ||
    (member.userId !== authenticated(req) &&
      !["owner", "admin"].includes(actor.role))
  )
    fail(404, "NOT_FOUND", "Участник не найден");
  const user = await db.user.findUniqueOrThrow({
    where: { id: member!.userId },
    select: { email: true },
  });
  res.json({ ...member, email: user.email });
});
organizations.delete("/:orgId/members/:memberId", async (req, res) => {
  const orgId = id(req, "orgId");
  await access(authenticated(req), orgId, null, false, true);
  const m = await db.membership.findFirst({
    where: { id: id(req, "memberId"), orgId },
  });
  if (!m) fail(404, "NOT_FOUND", "Участник не найден");
  if (m!.role === "owner")
    fail(409, "OWNER_REQUIRED", "Сначала передайте владение");
  await db.membership.delete({ where: { id: m!.id } });
  await db.session.deleteMany({ where: { userId: m!.userId } });
  res.json({ ok: true });
});
async function validateScopes(orgId: string, scopeIds: string[]) {
  if (
    (await db.analysisScope.count({
      where: { orgId, id: { in: scopeIds } },
    })) !== new Set(scopeIds).size
  )
    fail(422, "INVALID_SCOPES", "Недопустимое направление");
}
organizations.get("/:orgId/invitations", async (req, res) => {
  const orgId = id(req, "orgId");
  await access(authenticated(req), orgId, null, false, true);
  res.json(
    list(
      (
        await db.invitation.findMany({
          where: { orgId },
          orderBy: { id: "asc" },
        })
      ).map(({ tokenHash: _hash, ...x }) => x),
    ),
  );
});
organizations.post("/:orgId/invitations", async (req, res) => {
  const orgId = id(req, "orgId");
  await access(authenticated(req), orgId, null, false, true);
  const input = invitationInput.parse(req.body);
  await validateScopes(orgId, input.scopeIds);
  const raw = token();
  const row = await db.invitation.create({
    data: {
      ...input,
      email: input.email?.toLowerCase(),
      orgId,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  res.status(201).json({
    id: row.id,
    url: `${config.PUBLIC_APP_URL}/?action=invite&token=${raw}`,
  });
});
organizations.delete("/:orgId/invitations/:invitationId", async (req, res) => {
  const orgId = id(req, "orgId");
  await access(authenticated(req), orgId, null, false, true);
  await db.invitation.updateMany({
    where: { id: id(req, "invitationId"), orgId },
    data: { revoked: true },
  });
  res.json({ ok: true });
});
organizations.post("/:orgId/transfer-ownership", async (req, res) => {
  const orgId = id(req, "orgId"),
    userId = authenticated(req),
    m = await access(userId, orgId);
  if (m.role !== "owner")
    fail(403, "FORBIDDEN", "Только владелец может передать владение");
  const target = await db.membership.findFirst({
    where: { id: z.uuid().parse(req.body.memberId), orgId },
  });
  if (!target) fail(404, "NOT_FOUND", "Участник не найден");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
    await tx.membership.update({
      where: { id: m.id },
      data: { role: "admin" },
    });
    await tx.membership.update({
      where: { id: target!.id },
      data: { role: "owner", allScopes: true },
    });
    await tx.session.deleteMany({
      where: { userId: { in: [userId, target!.userId] } },
    });
  });
  res.json({ ok: true });
});
export const invitations = Router();
invitations.post("/accept", async (req, res) => {
  const userId = authenticated(req),
    raw = z.string().min(32).parse(req.body.token);
  const orgId = await db.$transaction(async (tx) => {
    const invite = await tx.invitation.findUnique({
      where: { tokenHash: hash(raw) },
    });
    if (
      !invite ||
      invite.revoked ||
      invite.acceptedAt ||
      invite.expiresAt < new Date()
    )
      fail(
        400,
        "INVALID_INVITATION",
        "Приглашение недействительно или уже использовано",
      );
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.verified || (invite!.email && invite!.email !== u.email))
      fail(
        403,
        "INVITATION_EMAIL",
        "Подтвердите email, указанный в приглашении",
      );
    const updated = await tx.invitation.updateMany({
      where: { id: invite!.id, acceptedAt: null, revoked: false },
      data: { acceptedAt: new Date() },
    });
    if (!updated.count)
      fail(409, "INVITATION_USED", "Приглашение уже использовано");
    await tx.membership.upsert({
      where: { orgId_userId: { orgId: invite!.orgId, userId } },
      update: {},
      create: {
        orgId: invite!.orgId,
        userId,
        role: invite!.role,
        allScopes: invite!.allScopes,
        scopeIds: invite!.scopeIds,
      },
    });
    return invite!.orgId;
  });
  res.json({ orgId, csrfToken: await newSession(req, res, userId) });
});
