type QuantityTargetCartItem = {
  cartId: string;
  itemId: string;
  spiceLevel?: string;
};

const normalizeOptionalText = (value?: string) => value?.trim().toLowerCase() ?? "";

export const resolveSetQuantityTarget = <T extends QuantityTargetCartItem>(
  cartItems: T[],
  action: { itemId: string; spiceLevel?: string },
) => {
  const itemMatches = cartItems.filter((item) => item.itemId === action.itemId);
  if (itemMatches.length === 0) {
    return null;
  }

  if (action.spiceLevel) {
    const requestedSpiceLevel = normalizeOptionalText(action.spiceLevel);
    const spiceMatches = itemMatches.filter(
      (item) => normalizeOptionalText(item.spiceLevel) === requestedSpiceLevel,
    );

    if (spiceMatches.length === 1) {
      return spiceMatches[0];
    }

    if (spiceMatches.length > 1) {
      return null;
    }
  }

  return itemMatches.length === 1 ? itemMatches[0] : null;
};
