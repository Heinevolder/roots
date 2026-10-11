// Shared by server and client.

const nf = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234 kr" */
export const kr = (n: number) => `${nf.format(n)} kr`;
/** "12,95" (for receipt lines) */
export const kr2 = (n: number) => nf2.format(n);
