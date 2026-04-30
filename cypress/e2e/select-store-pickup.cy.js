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
    homePage.addProductByName(testData.products.ledLamp.name)
    homePage.verifyCartCount('1')
    homePage.openCart()
    homePage.verifyDrawerOpen()
    homePage.verifyProductInCart(testData.products.ledLamp.name)
    // Assuming there are methods to verify quantity and price in the cart
    // homePage.verifyProductQuantityInCart(testData.products.ledLamp.name, '1')
    // homePage.verifyProductPriceInCart(testData.products.ledLamp.name, testData.products.ledLamp.price)
  })

  it('TC-002: Checkout with Store Pickup', () => {
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
    checkoutPage.selectPickup()
    checkoutPage.verifyPickupSelected()
    checkoutPage.selectStoreByText(testData.storeLocations.novaPaloAlto)
    checkoutPage.selectDateByText(testData.pickupDetails.desiredDay)
    checkoutPage.selectTimeByText(testData.pickupDetails.desiredTime)
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
    confirmationPage.continueShopping()
  })
})
