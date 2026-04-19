import AsyncStorage from "@react-native-async-storage/async-storage";

const CART_KEY = "@tracktrail_cart";

export async function getCart() {
  const data = await AsyncStorage.getItem(CART_KEY);
  return data ? JSON.parse(data) : [];
}

export async function addToCart(item: any) {
  const cart = await getCart();

  // Verifica se já existe
  const existing = cart.find((c: any) => c.id === item.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }

  await AsyncStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export async function updateQuantity(id: number, type: "increase" | "decrease") {
  const cart = await getCart();

  const updated = cart
    .map((item: any) => {
      if (item.id === id) {
        if (type === "increase") item.quantity++;
        if (type === "decrease" && item.quantity > 1) item.quantity--;
      }
      return item;
    })
    .filter((i: any) => i.quantity > 0);

  await AsyncStorage.setItem(CART_KEY, JSON.stringify(updated));
}

export async function removeFromCart(id: number) {
  const cart = await getCart();
  const updated = cart.filter((i: any) => i.id !== id);
  await AsyncStorage.setItem(CART_KEY, JSON.stringify(updated));
}

export async function clearCart() {
  await AsyncStorage.removeItem(CART_KEY);
}
