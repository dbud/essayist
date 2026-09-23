import { assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { transformPastedHtml } from "./htmlSanitizer.ts";

function transform(html: string): string {
  const win = new Window();
  const dom = new win.DOMParser().parseFromString(html, "text/html");
  // happy-dom types do not structurally satisfy the DOM interfaces
  transformPastedHtml(
    dom.body as unknown as ParentNode,
    dom as unknown as Document,
  );
  return dom.body.innerHTML;
}

Deno.test("renames del and strike to s", () => {
  assertEquals(
    transform("<p><del>gone</del><strike>struck</strike></p>"),
    "<p><s>gone</s><s>struck</s></p>",
  );
});

Deno.test("rewrites anchors to markdown link text", () => {
  assertEquals(
    transform('<p>see <a href="http://x.com">this</a> now</p>'),
    "<p>see [this](http://x.com) now</p>",
  );
});

Deno.test("keeps anchor children in the markdown link text", () => {
  assertEquals(
    transform('<a href="http://x.com"><em>go</em></a>'),
    "[<em>go</em>](http://x.com)",
  );
});

Deno.test("unwraps anchors without href", () => {
  assertEquals(transform("<p><a>plain</a></p>"), "<p>plain</p>");
});

Deno.test("writes bare urls for label-less anchors", () => {
  assertEquals(
    transform('<p><a href="http://x.com"><img src="i"></a></p>'),
    "<p>http://x.com</p>",
  );
});

Deno.test("leaves mark and u for the dompurify allowlist", () => {
  assertEquals(
    transform("<p><mark>m</mark><u>u</u></p>"),
    "<p><mark>m</mark><u>u</u></p>",
  );
});
