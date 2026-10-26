export type TradeMode = 'closed' | 'import' | 'export' | 'tariff' | 'quota';

function marketAtPrice(price: number) {
  const supply = 10 * price - 20;
  const demand = 100 - 10 * price;
  return {
    price,
    supply,
    demand,
    imports: Math.max(0, demand - supply),
    exports: Math.max(0, supply - demand),
    consumerSurplus: ((10 - price) * demand) / 2,
    producerSurplus: ((price - 2) * supply) / 2,
  };
}

export function tradeExample(mode: TradeMode, progress = 1) {
  const policy = mode === 'tariff' || mode === 'quota';
  const worldPrice = mode === 'export' ? 8 : 4;
  const before = marketAtPrice(policy ? worldPrice : 6);
  const price =
    before.price +
    ((mode === 'closed' ? 6 : policy ? 5 : worldPrice) - before.price) *
      Math.max(0, Math.min(1, progress));
  const after = marketAtPrice(price);
  const transfer = policy ? (price - worldPrice) * after.imports : 0;
  const productionLoss = policy ? ((after.supply - before.supply) * (price - worldPrice)) / 2 : 0;
  const consumptionLoss = policy ? ((before.demand - after.demand) * (price - worldPrice)) / 2 : 0;
  const consumerChange = after.consumerSurplus - before.consumerSurplus;
  const producerChange = after.producerSurplus - before.producerSurplus;
  return {
    before,
    after,
    worldPrice,
    policy,
    transfer,
    productionLoss,
    consumptionLoss,
    rentRecipient:
      mode === 'quota' ? 'domestic-license-holder' : mode === 'tariff' ? 'government' : null,
    consumerChange,
    producerChange,
    netChange: consumerChange + producerChange + transfer,
  };
}
