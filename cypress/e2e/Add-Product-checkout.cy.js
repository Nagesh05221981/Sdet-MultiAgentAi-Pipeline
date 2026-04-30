import HomePage from '../support/pages/home-page.js'
import CheckoutPage from '../support/pages/checkout-page.js'
import ConfirmationPage from '../support/pages/confirmation-page.js'

describe('Add Product to Cart and Checkout', () => {
  const homePage = new HomePage()
  const checkoutPage = new CheckoutPage()
  const confirmationPage = new ConfirmationPage()
  let testData

  beforeEach(() => {
    cy.fixture('test-data').then(data => { testData = data })
  })

  it('TC-001: Add a product to the cart and verify', () => {
    cy.visit('/index.html')
    homePage.addProductByName(testData.products.productToAdd.name)
    homePage.verifyCartCount('1')
    homePage.openCart()
    homePage.verifyDrawerOpen()
    homePage.verifyProductInCart(testData.products.productToAdd.name)
    homePage.verifyCartPriceInDrawer(testData.products.productToAdd.price)
  })

  it('TC-002: Complete checkout with Standard Shipping', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify({ "1": 1 }))
      }
    })
    homePage.openCart()
    homePage.proceedToCheckout()
    checkoutPage.verifyStepVisible('step1')
    checkoutPage.goToDeliveryStep()
    checkoutPage.verifyStepVisible('step2')
    checkoutPage.selectShipping()
    checkoutPage.verifyShippingSelected()
    checkoutPage.goToPaymentStep()
    checkoutPage.verifyStepVisible('step3')
    checkoutPage.fillPaymentDetails(
      testData.payment.validCard.number,
      testData.payment.validCard.name,
      testData.payment.validCard.expiry,
      testData.payment.validCard.cvv
    )
    checkoutPage.goToReviewStep()
    checkoutPage.verifyStepVisible('step4')
    checkoutPage.placeOrder()
    confirmationPage.verifyOrderConfirmed()
    confirmationPage.verifyOrderIdVisible()
    confirmationPage.verifyItemsListVisible()
    confirmationPage.verifyTotalsSectionVisible()
    confirmationPage.verifyDetailCardsVisible()
  })
})
