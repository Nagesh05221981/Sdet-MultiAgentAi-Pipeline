class CheckoutPage {
    elements = {
        // --- Stepper ---
        step1: () => cy.get('#step-1'),
        step2: () => cy.get('#step-2'),
        step3: () => cy.get('#step-3'),
        step4: () => cy.get('#step-4'),

        // --- Sections ---
        cartSection: () => cy.get('#sec-1'),
        deliverySection: () => cy.get('#sec-2'),
        paymentSection: () => cy.get('#sec-3'),
        reviewSection: () => cy.get('#sec-4'),

        // --- Cart ---
        cartItemsList: () => cy.get('#cart-items-list'),

        // --- Delivery Options ---
        shippingOption: () => cy.get('#opt-shipping'),
        pickupOption: () => cy.get('#opt-pickup'),
        pickupDetails: () => cy.get('#pickup-details'),
        locationGrid: () => cy.get('#location-grid'),
        scheduleSection: () => cy.get('#schedule-section'),
        datePicker: () => cy.get('#date-picker'),
        timeSection: () => cy.get('#time-section'),
        timeGrid: () => cy.get('#time-grid'),

        // --- Payment ---
        ccNumber: () => cy.get('#cc-number'),
        ccName: () => cy.get('#cc-name'),
        ccExp: () => cy.get('#cc-exp'),
        ccCvv: () => cy.get('#cc-cvv'),

        // --- Review ---
        reviewDelivery: () => cy.get('#review-delivery'),
        reviewPayment: () => cy.get('#review-payment'),
        reviewItems: () => cy.get('#review-items'),
        orderSummary: () => cy.get('#order-summary'),
        summaryItems: () => cy.get('#summary-items'),
        pickupSummary: () => cy.get('#pickup-summary'),
        pickupSummaryDetail: () => cy.get('#pickup-summary-detail'),

        // --- Action Buttons ---
        btnToDelivery: () => cy.get('#btn-to-2'),
        btnToPayment: () => cy.get('#btn-to-3'),
        btnReviewOrder: () => cy.contains('button', 'Review Order →'),
        btnPlaceOrder: () => cy.contains('button', 'Place Order ✔'),
        continueShoppingLink: () => cy.get('a.back-btn[href="index.html"]'),
    }

    // --- Navigation Methods ---
    goToDeliveryStep() {
        this.elements.btnToDelivery().should('be.visible').click()
    }

    goToPaymentStep() {
        this.elements.btnToPayment().should('be.visible').click()
    }

    goToReviewStep() {
        this.elements.btnReviewOrder().should('be.visible').click()
    }

    placeOrder() {
        this.elements.btnPlaceOrder().should('be.visible').click()
    }

    // --- Selection Methods ---
    selectShipping() {
        this.elements.shippingOption().should('be.visible').click()
    }

    selectPickup() {
        this.elements.pickupOption().should('be.visible').click()
    }

    selectStoreByText(name) {
        this.elements.locationGrid().contains(name).should('be.visible').click()
    }

    selectDateByText(text) {
        this.elements.datePicker().contains(text).should('be.visible').click()
    }

    selectTimeByText(text) {
        this.elements.timeGrid().contains(text).should('be.visible').click()
    }

    // --- Form Methods ---
    fillPaymentDetails(number, name, exp, cvv) {
        this.elements.ccNumber().clear().type(number)
        this.elements.ccName().clear().type(name)
        this.elements.ccExp().clear().type(exp)
        this.elements.ccCvv().clear().type(cvv)
    }

    // --- Verify Methods ---
    verifyStepVisible(stepName) {
        this.elements[stepName]().should('have.class', 'active')
    }

    verifyShippingSelected() {
        this.elements.shippingOption().should('have.class', 'selected')
    }

    verifyPickupSelected() {
        this.elements.pickupOption().should('have.class', 'selected')
    }

    verifyOrderConfirmed() {
        cy.url().should('include', '/confirmation')
    }

    verifyOrderIdVisible() {
        cy.get('#order-id').should('be.visible')
    }
}
export default CheckoutPage
