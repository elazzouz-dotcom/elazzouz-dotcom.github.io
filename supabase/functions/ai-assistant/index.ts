import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://elazzouz-dotcom.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const limitText = (value: unknown, max: number) => String(value ?? "").slice(0, max);

async function userFromRequest(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "هذه الدالة تقبل POST فقط." }, 405);
  if (Number(request.headers.get("content-length") || 0) > 30000) return json({ ok: false, error: "حجم الطلب كبير جدًا." }, 413);
  const user = await userFromRequest(request);
  if (!user) return json({ ok: false, error: "سجّل الدخول لاستخدام المساعد السحابي." }, 401);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL");
  if (!apiKey || !model) return json({ ok: false, error: "المساعد السحابي غير مفعّل بعد." }, 503);

  let payload: { mode?: string; question?: string; snapshot?: Record<string, unknown> };
  try { payload = await request.json(); } catch { return json({ ok: false, error: "صيغة JSON غير صالحة." }, 400); }
  const mode = ["chat", "analyze", "share", "price"].includes(payload.mode || "") ? payload.mode : "chat";
  const snapshot = JSON.stringify(payload.snapshot || {}).slice(0, 16000);
  const question = limitText(payload.question, 1000);
  const system = `أنت مساعد عربي داخل أداة متابعة يدوية. أجب بالعربية المغربية أو العربية الفصحى المبسطة وباختصار. حلل البيانات التي يرسلها المستخدم فقط. لا تدّعي أنك دخلت TikTok، ولا تقترح أتمتة أو قراءة الشاشة أو فتح الصناديق أو جمع العملات. لا تقدم توصيات مالية بالشراء أو البيع؛ قدم وصفًا وتنبيهًا عامًا فقط. أنشئ نصوص مشاركة آمنة عند الطلب. المهمة الحالية: ${mode}.`;
  const userMessage = `سؤال المستخدم: ${question || "حلل البيانات وقدّم اقتراحًا عمليًا."}\nبيانات الأداة المحلية (قد تكون فارغة): ${snapshot}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.3, max_tokens: 700, messages: [{ role: "system", content: system }, { role: "user", content: userMessage }] }),
  });
  if (!response.ok) return json({ ok: false, error: "تعذر الوصول إلى المساعد السحابي حاليًا." }, 502);
  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content;
  if (!answer) return json({ ok: false, error: "لم يُرجع المساعد إجابة." }, 502);
  return json({ ok: true, answer: String(answer).slice(0, 6000), userId: user.id });
});
