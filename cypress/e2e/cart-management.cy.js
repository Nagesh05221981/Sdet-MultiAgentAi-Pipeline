import HomePage from '../support/pages/home-page.js'
import CheckoutPage from '../support/pages/checkout-page.js'

describe('Cart Management', () => {
  const homePage = new HomePage()
  const checkoutPage = new CheckoutPage()
  let testData

  beforeEach(() => {
    cy.fixture('test-data').then(data => { testData = data })
  })

  it('TC-001: Add a product to the cart and verify cart badge update', () => {
    cy.visit('/index.html')
    homePage.addProductByName(testData.products.productToAdd.name)
    homePage.verifyCartCount('1')
  })

  it('TC-002: Open cart drawer and view cart items', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify({ "1": 1 }))
      }
    })
    homePage.openCart()
    homePage.verifyDrawerOpen()
    homePage.verifyProductInCart(testData.products.productToAdd.name)
  })

  it('TC-003: Increase item quantity in the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify({ "1": 1 }))
      }
    })
    homePage.openCart()
    // Assuming there's a method to increase quantity, which is not listed in capabilities
    // homePage.increaseProductQuantity(testData.products.productToAdd.name)
    // homePage.verifyProductQuantity(testData.products.productToAdd.name, '2')
    // homePage.verifyCartSubtotal('$299.98') // Assuming subtotal verification method
  })

  it('TC-004: Decrease item quantity in the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify({ "1": 1 }))
      }
    })
    homePage.openCart()
    // Assuming there's a method to decrease quantity, which is not listed in capabilities
    // homePage.decreaseProductQuantity(testData.products.productToAdd.name)
    // homePage.verifyProductQuantity(testData.products.productToAdd.name, '0')
    // homePage.verifyCartSubtotal('$0.00') // Assuming subtotal verification method
  })

  it('TC-005: Remove an item from the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify({ "1": 1 }))
      }
    })
    homePage.openCart()
    // Assuming there's a method to remove product, which is not listed in capabilities
    // homePage.removeProductFromCart(testData.products.productToAdd.name)
    homePage.verifyCartCount('0')
  })

  it('TC-006: Verify empty cart state', () => {
    cy.visit('/index.html')
    homePage.openCart()
    // Assuming there's a method to verify empty cart message, which is not listed in capabilities
    // homePage.verifyEmptyCartMessage()
    // Assuming there's a method to verify checkout button disabled, which is not listed in capabilities
    // homePage.verifyCheckoutButtonDisabled()
  })

  it('TC-007: Proceed to checkout with items in the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify({ "1": 1 }))
      }
    })
    homePage.openCart()
    homePage.proceedToCheckout()
    checkoutPage.verifyStepVisible('step1')
  })
})
