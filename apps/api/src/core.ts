import {randomBytes,createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';
import {db,json} from '@context/db';
import {config} from '@context/config';
import {Redis} from 'ioredis';
export const redis=new Redis(config.REDIS_URL,{maxRetriesPerRequest:null});
export const token=()=>randomBytes(32).toString('hex');
export const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export class HttpError extends Error {constructor(public status:number,public code:string,message:string,public details?:unknown){super(message);}}
export const fail=(status:number,code:string,message:string):never=>{throw new HttpError(status,code,message);};
// Express extends its global namespace when adding request-scoped middleware data.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {namespace Express {interface Request {userId?:string;sessionId?:string;csrf?:string;requestId:string;}}}
export const id=(req:Request,key:string)=>String(req.params[key]||'');
export function authenticated(req:Request){return req.userId||fail(401,'UNAUTHENTICATED','Войдите в аккаунт');}
export async function session(req:Request,res:Response,next:NextFunction){
 req.requestId=randomUUID();res.setHeader('X-Request-Id',req.requestId);
 const raw=req.cookies?.context_session;
 const found=typeof raw==='string'?await db.session.findUnique({where:{id:hash(raw)}}):null;
 if(found&&found.expiresAt>new Date()){req.sessionId=found.id;req.userId=found.userId||undefined;req.csrf=found.csrf;}
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  if(req.get('origin')!==new URL(config.PUBLIC_APP_URL).origin)return next(new HttpError(403,'ORIGIN','Недопустимый источник запроса'));
  const sent=req.get('x-csrf-token')||'';if(!req.csrf||sent.length!==req.csrf.length||!timingSafeEqual(Buffer.from(sent),Buffer.from(req.csrf)))return next(new HttpError(403,'CSRF','Обновите страницу и повторите запрос'));
 }
 next();
}
export async function newSession(req:Request,res:Response,userId?:string){
 if(req.sessionId)await db.session.deleteMany({where:{id:req.sessionId}});
 const raw=token(),csrf=token();await db.session.create({data:{id:hash(raw),csrf,userId,expiresAt:new Date(Date.now()+7*86400000)}});
 res.cookie('context_session',raw,{httpOnly:true,sameSite:'lax',secure:config.PUBLIC_APP_URL.startsWith('https:'),maxAge:7*86400000,path:'/'});return csrf;
}
export async function limit(key:string,max:number,seconds:number){const k='context:'+config.APP_MODE+':limit:'+hash(key);const n=await redis.incr(k);if(n===1)await redis.expire(k,seconds);if(n>max)throw new HttpError(429,'RATE_LIMIT','Слишком много запросов',{retryAfter:await redis.ttl(k)});}
export async function access(userId:string,orgId:string,scopeId?:string|null,write=false,admin=false){
 const m=await db.membership.findUnique({where:{orgId_userId:{orgId,userId}}});if(!m)fail(404,'NOT_FOUND','Объект не найден');
 if(scopeId){const s=await db.analysisScope.findFirst({where:{id:scopeId,orgId}});if(!s||(!['owner','admin'].includes(m!.role)&&!m!.allScopes&&!m!.scopeIds.includes(scopeId)))fail(404,'NOT_FOUND','Объект не найден');}
 if(write&&m!.role==='reader'||admin&&!['owner','admin'].includes(m!.role))fail(403,'FORBIDDEN','Недостаточно прав');
 return m!;
}
export async function scopeWhere(userId:string,orgId:string){const m=await access(userId,orgId);return ['owner','admin'].includes(m.role)||m.allScopes?{orgId}:{orgId,scopeId:{in:m.scopeIds}};}
export async function profile(orgId:string,scopeId?:string|null){return db.profileVersion.findFirst({where:{orgId,scopeId:scopeId||null},orderBy:{version:'desc'}});}
export async function effectiveProfile(orgId:string,scopeId:string){const [base,over,org,competitors]=await Promise.all([profile(orgId),profile(orgId,scopeId),db.organization.findUniqueOrThrow({where:{id:orgId}}),db.competitor.findMany({where:{orgId,scopeId,decision:'confirmed',monitoring:'active'}})]);return {profileVersionId:[base?.id,over?.id].filter(Boolean).join(':'),fields:{name:org.name,stage:org.stage,description:org.description,...base?.fields as object,...over?.fields as object},competitors};}
export async function audit(userId:string,orgId:string|null,action:string,metadata:unknown){await db.auditRecord.create({data:{userId,orgId,action,metadata:json(metadata)}});}
export const pagination=(req:Request)=>({take:Math.min(100,Math.max(1,Number(req.query.limit)||20)),...(typeof req.query.cursor==='string'?{cursor:{id:req.query.cursor},skip:1}:{})});
export function list<T extends {id:string}>(items:T[]){return {items,nextCursor:items.length?items.at(-1)!.id:null};}
