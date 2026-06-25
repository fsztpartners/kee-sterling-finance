import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

// This agent does ALL its work through the authored `assess_account` tool, which
// runs in the app runtime. It never calls ctx.getSandbox(). The default sandbox
// ships a real bash/python/curl, which a cheap model will improvise in when it
// can't satisfy a request with its tools — so we pin just-bash: a pure-JS
// interpreter with a virtual filesystem, NO real binaries, NO network. There is
// no legitimate sandbox use here to break.
export default defineSandbox({
  backend: justbash(),
});
