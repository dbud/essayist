// Options shared by all dbctl subcommands, declared on the root command.
export type DbctlGlobals = {
  /** Only ever true or absent: --local works on the D1 state of the vite dev server. */
  local?: true;
};
