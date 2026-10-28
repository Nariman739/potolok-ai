import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`select kind, count(*)::int n from "KpLibraryPhoto" group by 1 order by 2 desc`;
console.log(r.map(x=>`${x.kind} ${x.n}`).join(" | "));
