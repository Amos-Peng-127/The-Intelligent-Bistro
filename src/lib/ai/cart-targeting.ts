type QuantityTargetCartItem = {
  cartId: string;
  itemId: string;
  spiceLevel?: string;
  addOns: Array<{ id: string }>;
};

const normalizeOptionalText = (value?: string) => value?.trim().toLowerCase() ?? "";
const normalizeAddOnIds = (addOnIds?: string[]) =>
  [...new Set((addOnIds ?? []).map((addOnId) => addOnId.trim().toLowerCase()).filter(Boolean))].sort();

const matchesAddOnIds = (itemAddOns: Array<{ id: string }>, actionAddOnIds?: string[]) => {
  if (!Array.isArray(actionAddOnIds)) {
    return true;
  }

  const requestedAddOnIds = normalizeAddOnIds(actionAddOnIds);
  const itemAddOnIds = normalizeAddOnIds(itemAddOns.map((addOn) => addOn.id));

  return (
    requestedAddOnIds.length === itemAddOnIds.length &&
    requestedAddOnIds.every((addOnId, index) => addOnId === itemAddOnIds[index])
  );
};

export const matchesActionCartVariant = <T extends QuantityTargetCartItem>(
  cartItem: T,
  action: { itemId: string; spiceLevel?: string; addOnIds?: string[] },
) => {
  if (cartItem.itemId !== action.itemId) {
    return false;
  }

  if (
    action.spiceLevel &&
    normalizeOptionalText(cartItem.spiceLevel) !== normalizeOptionalText(action.spiceLevel)
  ) {
    return false;
  }

  return matchesAddOnIds(cartItem.addOns, action.addOnIds);
};

export const resolveSetQuantityTarget = <T extends QuantityTargetCartItem>(
  cartItems: T[],
  action: { itemId: string; spiceLevel?: string; addOnIds?: string[] },
) => {
  let itemMatches = cartItems.filter((item) => item.itemId === action.itemId);
  if (itemMatches.length === 0) {
    return null;
  }

  if (action.spiceLevel) {
    const requestedSpiceLevel = normalizeOptionalText(action.spiceLevel);
    itemMatches = itemMatches.filter(
      (item) => normalizeOptionalText(item.spiceLevel) === requestedSpiceLevel,
    );
    if (itemMatches.length === 0) {
      return null;
    }
  }

  if (Array.isArray(action.addOnIds)) {
    itemMatches = itemMatches.filter((item) => matchesAddOnIds(item.addOns, action.addOnIds));
    if (itemMatches.length === 0) {
      return null;
    }
  }

  return itemMatches.length === 1 ? itemMatches[0] : null;
};
