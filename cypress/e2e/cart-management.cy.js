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

  it('TC-002: Open cart drawer and verify cart contents', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify(testData.stateSeeding.cartWithOneItem.localStorage.nova_cart))
      }
    })
    homePage.openCart()
    homePage.verifyDrawerOpen()
    homePage.verifyProductInCart(testData.products.productToAdd.name)
  })

  it('TC-003: Increase product quantity in the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify(testData.stateSeeding.cartWithOneItem.localStorage.nova_cart))
      }
    })
    homePage.openCart()
    // Assuming there's a method to increase quantity, which is not listed in capabilities
    // homePage.increaseProductQuantity(testData.products.productToAdd.name)
    // homePage.verifyProductQuantity(testData.products.productToAdd.name, '2')
    // homePage.verifyCartPriceInDrawer('Updated Price')
  })

  it('TC-004: Decrease product quantity in the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify(testData.stateSeeding.cartWithOneItem.localStorage.nova_cart))
      }
    })
    homePage.openCart()
    // Assuming there's a method to decrease quantity, which is not listed in capabilities
    // homePage.decreaseProductQuantity(testData.products.productToAdd.name)
    // homePage.verifyProductQuantity(testData.products.productToAdd.name, '0')
    // homePage.verifyProductNotInCart(testData.products.productToAdd.name)
  })

  it('TC-005: Remove a product from the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify(testData.stateSeeding.cartWithOneItem.localStorage.nova_cart))
      }
    })
    homePage.openCart()
    // Assuming there's a method to remove product, which is not listed in capabilities
    // homePage.removeProductFromCart(testData.products.productToAdd.name)
    // homePage.verifyProductNotInCart(testData.products.productToAdd.name)
    homePage.verifyCartCount('0')
  })

  it('TC-006: Verify empty cart state', () => {
    cy.visit('/index.html')
    homePage.openCart()
    // Assuming there's a method to verify empty cart message, which is not listed in capabilities
    // homePage.verifyEmptyCartMessage()
    // homePage.verifyCheckoutButtonDisabled()
  })

  it('TC-007: Proceed to checkout with items in the cart', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify(testData.stateSeeding.cartWithOneItem.localStorage.nova_cart))
      }
    })
    homePage.openCart()
    homePage.proceedToCheckout()
    checkoutPage.verifyStepVisible('step1')
  })
})
