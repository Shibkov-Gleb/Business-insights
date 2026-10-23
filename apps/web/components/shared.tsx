'use client';
import type {ReactNode} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Loader2,Sparkles,X} from 'lucide-react';
export type Row=Record<string,any>;
export type Action=(fn:()=>Promise<unknown>)=>Promise<void>;
let csrf='';
export async function api(path:string,method='GET',body?:unknown){if(method!=='GET'&&!csrf)csrf=(await(await fetch('/api/v1/auth/csrf')).json()).csrfToken;const headers:Record<string,string>={};if(method!=='GET'){headers['X-CSRF-Token']=csrf;headers['Idempotency-Key']=crypto.randomUUID();}if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch('/api/v1'+path,{method,credentials:'same-origin',headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){if(r.status===403)csrf='';throw new Error(data.error?.message||'Ошибка запроса');}if(data.csrfToken)csrf=data.csrfToken;return data;}
export const date=(s?:string)=>s?new Date(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'Ещё не проводился';
export const text=(x:any)=>x==null?'':String(typeof x==='object'&&'value'in x?x.value:x);
export function Button({children,kind='',...props}:{children:ReactNode;kind?:string;[key:string]:any}){return <button type="button" className={'button '+kind} {...props}>{children}</button>;}
export function Modal({open,onClose,title,children,wide=false}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;wide?:boolean}){return <Dialog.Root open={open} onOpenChange={v=>!v&&onClose()}><Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className={'modal '+(wide?'wide':'')} aria-describedby={undefined}><div className="modal-head"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="Закрыть"><X size={20}/></button></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;}
export function Field({label,children,note}:{label:string;children:ReactNode;note?:string}){return <label className="field"><span>{label}</span>{children}{note&&<small>{note}</small>}</label>;}
export function Empty({title,children,icon=<Sparkles/>}:{title:string;children:ReactNode;icon?:ReactNode}){return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{children}</p></div>;}
export function Loading(){return <div className="loading" role="status"><Loader2 className="spin"/> Загружаем данные…</div>;}
export function ErrorNote({error}:{error:unknown}){return error?<div className="error" role="alert">{error instanceof Error?error.message:String(error)}</div>:null;}
export function Heading({title,description,children}:{title:string;description:string;children?:ReactNode}){return <div className="page-heading"><div><div className="eyebrow">КОНТЕКСТ ПРОЕКТА</div><h1>{title}<span className="accent">.</span></h1><p>{description}</p></div>{children}</div>;}
