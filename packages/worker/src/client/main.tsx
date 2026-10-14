// Client app entry: the SSR document sets data-client on <body> and this
// boots the matching page module. Chunk splitting happens later via explicit
// dynamic import() boundaries (diff worker, Lexical), not per page.
if (import.meta.env.DEV) {
  import("preact/debug");
}

const page = document.body.dataset.client;

if (page === "home") {
  import("./pages/home").then((home) => home.boot());
}
