import { createClient } from "npm:@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"https://det607flagdetail.com","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
 const token=request.headers.get('Authorization');if(!token)return new Response(JSON.stringify({error:'Sign-in is required'}),{status:401,headers});
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}') as Record<string,string>,service=Object.values(secretKeys).find(value=>typeof value==='string')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:token}}}),{data:{user},error:userError}=await userClient.auth.getUser();
 if(userError||!user)return new Response(JSON.stringify({error:'Invalid session'}),{status:401,headers});
 const {data:caller,error:callerError}=await userClient.rpc('get_my_profile').maybeSingle();
 if(callerError)return new Response(JSON.stringify({error:`Administrator lookup failed: ${callerError.message}`}),{status:500,headers});
 const admin=createClient(url,service);
 if(!caller?.active||!['ADMIN','SUPER_ADMIN'].includes(caller.admin_level))return new Response(JSON.stringify({error:'Administrator access is required'}),{status:403,headers});
 const {fullName,email,cadetType}=await request.json(),normalizedEmail=String(email||'').trim().toLowerCase();
 if(!String(fullName||'').trim()||!/^\S+@\S+\.\S+$/.test(normalizedEmail)||!['GMC','POC'].includes(cadetType))return new Response(JSON.stringify({error:'Name, valid email, and classification are required'}),{status:400,headers});
 let inviteResult=await admin.auth.admin.generateLink({type:'invite',email:normalizedEmail,options:{redirectTo:'https://det607flagdetail.com/',data:{full_name:String(fullName).trim()}}});
 // A prior test can leave an Auth account without a roster profile. Give that cadet
 // a password-setup link rather than rejecting the administrator's resend request.
 if(inviteResult.error?.message.toLowerCase().includes('already registered'))inviteResult=await admin.auth.admin.generateLink({type:'recovery',email:normalizedEmail,options:{redirectTo:'https://det607flagdetail.com/'}});
 const {data:invited,error:inviteError}=inviteResult;
 if(inviteError||!invited.user||!invited.properties?.action_link)return new Response(JSON.stringify({error:inviteError?.message||'Invite could not be created'}),{status:400,headers});
 const {error:profileError}=await userClient.rpc('admin_create_invited_cadet_profile',{target_id:invited.user.id,new_name:String(fullName).trim(),new_email:normalizedEmail,new_cadet_type:cadetType});
 if(profileError)return new Response(JSON.stringify({error:profileError.message}),{status:500,headers});
 const emailResponse=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('RESEND_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({from:'DET 607 Flag Detail <noreply@mail.det607flagdetail.com>',to:[normalizedEmail],subject:'DET 607 Flag Detail Invitation',html:`<h2>DET 607 Flag Detail Invitation</h2><p>Hello ${String(fullName).trim()},</p><p>You have been invited to create your account for DET 607 Flag Detail Management.</p><p>Use the secure link below to set your password and complete your cadet profile.</p><p><a href="${invited.properties.action_link}">Accept invitation</a></p><p>If you were not expecting this invitation, you may disregard this email.</p>`})});
 if(!emailResponse.ok){const responseText=await emailResponse.text();return new Response(JSON.stringify({error:`Invitation account was created, but the DET 607 email could not be sent: ${responseText}`}),{status:502,headers});}
 return new Response(JSON.stringify({ok:true}),{headers});
});
