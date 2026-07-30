// Inline first-paint script that sets `data-theme` from the stored preference
// before the app renders, avoiding a light-mode flash for dark/auto users.
// `dangerouslySetInnerHTML` is required: Preact's SSR escapes string children
// (including inside <script>), which would turn `"` into `&quot;` and break the
// JS.
export default function ThemeInitScript() {
  return (
    <script
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{
        __html: `
          (function () {
            try {
              var s = localStorage.getItem("theme");
              var p = s ? JSON.parse(s) : "auto";
              var d =
                p === "dark" ||
                (p === "auto" &&
                  matchMedia("(prefers-color-scheme: dark)").matches);
              document.documentElement.dataset.theme = d
                ? "essayist-dark"
                : "essayist";
            } catch (e) {}
          })();
        `,
      }}
    />
  );
}
