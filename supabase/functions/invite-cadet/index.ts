import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"https://det607flagdetail.com","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
 const token=request.headers.get('Authorization');if(!token)return new Response(JSON.stringify({error:'Sign-in is required'}),{status:401,headers});
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:token}}}),{data:{user},error:userError}=await userClient.auth.getUser();
 if(userError||!user)return new Response(JSON.stringify({error:'Invalid session'}),{status:401,headers});
 const admin=createClient(url,service),{data:caller}=await admin.from('profiles').select('admin_level,active').eq('id',user.id).maybeSingle();
 if(!caller?.active||!['ADMIN','SUPER_ADMIN'].includes(caller.admin_level))return new Response(JSON.stringify({error:'Administrator access is required'}),{status:403,headers});
 const {fullName,email,cadetType}=await request.json(),normalizedEmail=String(email||'').trim().toLowerCase();
 if(!String(fullName||'').trim()||!/^\S+@\S+\.\S+$/.test(normalizedEmail)||!['GMC','POC'].includes(cadetType))return new Response(JSON.stringify({error:'Name, valid email, and classification are required'}),{status:400,headers});
 const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(normalizedEmail,{redirectTo:'https://det607flagdetail.com/',data:{full_name:String(fullName).trim()}});
 if(inviteError||!invited.user)return new Response(JSON.stringify({error:inviteError?.message||'Invite could not be created'}),{status:400,headers});
 const {error:profileError}=await admin.from('profiles').upsert({id:invited.user.id,full_name:String(fullName).trim(),email:normalizedEmail,role:cadetType,cadet_type:cadetType,admin_level:'NONE',active:true},{onConflict:'id'});
 if(profileError)return new Response(JSON.stringify({error:profileError.message}),{status:500,headers});
 return new Response(JSON.stringify({ok:true}),{headers});
});
