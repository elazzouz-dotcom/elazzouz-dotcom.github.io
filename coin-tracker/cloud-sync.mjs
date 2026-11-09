import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL='https://tehzgquayhpnkkfcjjdz.supabase.co';
const SUPABASE_KEY='sb_publishable_Q1YnowTXKe9m_EUOOeiscw_GMy_Qtz-';
const CELEB_KEY='azzouz.coin-tracker.celebrities.v1';
const BOX_KEY='azzouz.coin-tracker.boxes.v1';
const DATA_KEY='coin_tracker_data';
const $=id=>document.getElementById(id);
const read=key=>{try{const data=JSON.parse(localStorage.getItem(key));return Array.isArray(data)?data:[]}catch{return[]}};
const write=(key,data)=>localStorage.setItem(key,JSON.stringify(data));

export function initCloudSync(){const root=$('cloudSync');if(!root)return;const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);let user=null;let applyingRemote=false;let timer=null;
 const status=(text,type='')=>{$('cloudStatus').textContent=text;$('cloudStatus').className=`cloud-status ${type}`};
 const setSignedIn=logged=>{$('cloudAuthForm').hidden=logged;$('cloudAccount').hidden=!logged;$('cloudUserEmail').textContent=user?.email||''};
 const localPayload=()=>({version:1,updatedAt:new Date().toISOString(),celebrities:read(CELEB_KEY),boxes:read(BOX_KEY)});
 async function saveRemote(){if(!user||applyingRemote)return;clearTimeout(timer);timer=setTimeout(async()=>{const payload=localPayload();const {error}=await supabase.auth.updateUser({data:{[DATA_KEY]:payload}});if(error)status(`تعذر حفظ المزامنة: ${error.message}`,'error');else status(`تمت المزامنة تلقائيًا · ${new Date().toLocaleTimeString('ar-MA',{hour:'2-digit',minute:'2-digit'})}`,'ok')},700)}
 function applyRemote(payload){if(!payload||!Array.isArray(payload.celebrities)||!Array.isArray(payload.boxes))return;applyingRemote=true;write(CELEB_KEY,payload.celebrities);write(BOX_KEY,payload.boxes);window.dispatchEvent(new CustomEvent('celebrity-watch-updated'));window.dispatchEvent(new CustomEvent('box-log-updated'));setTimeout(()=>{applyingRemote=false},0)}
 async function loadRemote(){if(!user)return;const payload=user.user_metadata?.[DATA_KEY];if(payload?.celebrities&&payload?.boxes){applyRemote(payload);status('تم تحميل بياناتك من السحابة.','ok')}else{await saveRemote();status('تم تجهيز المزامنة السحابية لهذا الحساب.','ok')}}
 $('cloudAuthForm').onsubmit=async event=>{event.preventDefault();const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;if(!email||password.length<6){status('أدخل بريدًا صحيحًا وكلمة مرور من 6 أحرف على الأقل.','error');return}const action=$('cloudMode').value;status('جارٍ الاتصال...');const result=action==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(result.error){status(result.error.message,'error');return}user=result.data.user;if(action==='signup'&&!result.data.session){status('تم إنشاء الحساب. افحص البريد لتأكيد الحساب ثم سجّل الدخول.','ok');return}setSignedIn(true);await loadRemote()};
 $('cloudSignOut').onclick=async()=>{await supabase.auth.signOut();user=null;setSignedIn(false);status('تم تسجيل الخروج. البيانات المحلية لم تُحذف.');};
 $('cloudSyncNow').onclick=async()=>{if(!user)return;clearTimeout(timer);const {error}=await supabase.auth.updateUser({data:{[DATA_KEY]:localPayload()}});status(error?`تعذر الحفظ: ${error.message}`:'تمت مزامنة البيانات الآن.',error?'error':'ok')};
 $('cloudMode').onchange=()=>{$('cloudSubmit').textContent=$('cloudMode').value==='signup'?'إنشاء حساب ومزامنة':'تسجيل الدخول والمزامنة'};
 window.addEventListener('celebrity-watch-updated',saveRemote);window.addEventListener('box-log-updated',saveRemote);
 supabase.auth.getSession().then(async({data})=>{user=data.session?.user||null;setSignedIn(!!user);if(user)await loadRemote();else status('سجّل الدخول لمزامنة بياناتك بين الأجهزة.')});supabase.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;setSignedIn(!!user);if(user)await loadRemote()});
}
