// Options shared by all dbctl subcommands, declared on the root command.
export type DbctlGlobals = {
  /** Only ever true or absent: --remote works on the deployed database. */
  remote?: true;
};
