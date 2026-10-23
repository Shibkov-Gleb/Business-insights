import {PrismaClient,Prisma} from '../generated/client.ts';
import {PrismaPg} from '@prisma/adapter-pg';
import {config} from '@context/config';
export const db=new PrismaClient({adapter:new PrismaPg({connectionString:config.DATABASE_URL})});
export {Prisma};
export type Tx=Prisma.TransactionClient;
export const json=(x:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(x));
