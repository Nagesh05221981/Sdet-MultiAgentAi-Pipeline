# Cart Management

## User Story
As a shopper, I want to add products to my cart, view cart contents, adjust quantities, and remove items, so that I can manage what I want to purchase.

## Acceptance Criteria

1. **Add to cart**: When I click "+ Add" on a product card, the item should be added to the cart and the button should change to "Added".
2. **Cart badge updates**: The cart badge count in the navigation should update whenever items are added or removed.
3. **Open cart drawer**: When I click the cart pill in the nav, the cart drawer should slide open.
4. **View cart items**: The cart drawer should list all added products with name, price, and quantity.
5. **Increase quantity**: Clicking the "+" button in the cart should increase the item quantity and update the subtotal.
6. **Decrease quantity**: Clicking the "-" button should decrease the quantity. If quantity reaches 0, the item should be removed.
7. **Remove item**: Clicking the delete button should remove the item from the cart entirely.
8. **Cart total**: The cart drawer should show the correct total price based on items and quantities.
9. **Empty cart state**: When the cart is empty, it should display an "empty cart" message and the checkout button should be disabled.
10. **Proceed to checkout**: The "Proceed to Checkout" button should navigate to checkout.html when the cart has items.
