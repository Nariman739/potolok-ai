// Поддельный шлюз ВТБ для стенда: register.do и getOrderStatusExtended.do (всё «оплачено»).
import http from "http";
const orders = new Map();
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const p = new URLSearchParams(b);
    res.setHeader("content-type", "application/json");
    if (req.url.endsWith("/register.do")) {
      const md = "md-" + Math.random().toString(36).slice(2, 10);
      orders.set(p.get("orderNumber"), { md, amount: Number(p.get("amount")) });
      return res.end(JSON.stringify({ orderId: md, formUrl: "https://gw.local/form/" + md }));
    }
    if (req.url.endsWith("/getOrderStatusExtended.do")) {
      const on = p.get("orderNumber") ?? [...orders].find(([, v]) => v.md === p.get("orderId"))?.[0];
      const o = on && orders.get(on);
      if (!o) return res.end(JSON.stringify({ errorCode: "6" }));
      return res.end(JSON.stringify({ errorCode: "0", orderNumber: on, orderStatus: 2, amount: o.amount, currency: "398", actionCode: 0 }));
    }
    res.statusCode = 404; res.end("{}");
  });
}).listen(3999, () => console.log("mock gw 3999"));
