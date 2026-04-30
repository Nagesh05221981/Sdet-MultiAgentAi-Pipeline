class ConfirmationPage {
    elements = {
        // --- Order Details ---
        orderId:        () => cy.get('.confirm-page #order-id'),
        detailCards:    () => cy.get('.confirm-page #detail-cards'),

        // --- Items & Totals ---
        itemsList:      () => cy.get('.items-card #items-list'),
        totalsSection:  () => cy.get('.items-card #totals-section'),

        // --- Call to Action ---
        printReceiptBtn: () => cy.contains('button', 'Print Receipt'),
        continueShoppingLink: () => cy.get('.cta-row a.cta-primary[href="index.html"]'),

        // --- Navigation ---
        navLogo:        () => cy.get('a.nav-logo[href="index.html"]'),
        shopLink:       () => cy.get('.nav-links a.nav-link[href="index.html"]'),
    }

    // --- Action Methods ---
    printReceipt() {
        this.elements.printReceiptBtn().should('be.visible').click()
    }

    continueShopping() {
        this.elements.continueShoppingLink().should('be.visible').click()
    }

    // --- Verify Methods ---
    verifyOrderConfirmed() {
        this.elements.orderId().should('be.visible')
    }

    verifyOrderIdVisible() {
        this.elements.orderId().should('be.visible')
    }

    verifyItemsListVisible() {
        this.elements.itemsList().should('be.visible')
    }

    verifyTotalsSectionVisible() {
        this.elements.totalsSection().should('be.visible')
    }

    verifyDetailCardsVisible() {
        this.elements.detailCards().should('be.visible')
    }
}

export default ConfirmationPage
