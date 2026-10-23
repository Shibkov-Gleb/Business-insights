// Prices are USD per million tokens. BigInt arithmetic keeps monetary values decimal.
const scaled = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
};
export function estimateCost(
  input: number,
  output: number,
  inputPrice: string,
  outputPrice: string,
) {
  if (!inputPrice || !outputPrice) return null;
  const nanos =
    (BigInt(input) * scaled(inputPrice) +
      BigInt(output) * scaled(outputPrice)) /
    1_000_000n;
  return {
    amount: `${nanos / 1_000_000_000n}.${(nanos % 1_000_000_000n).toString().padStart(9, "0")}`,
    currency: "USD",
    estimated: true,
  };
}
