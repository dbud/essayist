import { InMemoryAdapter, VirtualFileSystem } from "@essayist/core";

const adapter = new InMemoryAdapter();
export const vfs = new VirtualFileSystem(adapter);

vfs.write(
  "essay.txt",
  "The quick brown fox jumps over the lazy dog.\n" +
    "This sentence contains every letter of the alphabet.\n" +
    "It has been used as a typing test since the late 1800s.",
);

vfs.write(
  "report.txt",
  "Q3 revenue grew 12% year-over-year.\n" +
    "Operating margins improved due to cost optimization.\n" +
    "Customer acquisition cost decreased by 8%.",
);
