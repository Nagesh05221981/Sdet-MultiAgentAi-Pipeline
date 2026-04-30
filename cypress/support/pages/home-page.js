class HomePage {
    elements = {
        // --- Navigation ---
        searchInput:    () => cy.get('#search-input'),
        cartCount:      () => cy.get('#cart-count'),
        loginButton:    () => cy.contains('button', 'Login'),
        signUpButton:   () => cy.contains('button', 'Sign Up'),
        cartPill:       () => cy.get('.cart-pill'),
        drawer:         () => cy.get('#drawer'),
        checkoutBtn:    () => cy.get('#checkout-btn'),
        authModal:      () => cy.get('#auth-modal'),
        userChip:       () => cy.get('#user-chip'),
        unameLabel:     () => cy.get('#uname-label'),

        // --- Forms ---
        loginEmail:     () => cy.get('#l-email'),
        loginPassword:  () => cy.get('#l-pass'),
        signupName:     () => cy.get('#s-name'),
        signupEmail:    () => cy.get('#s-email'),
        signupPassword: () => cy.get('#s-pass'),
        signupMessage:  () => cy.get('#s-msg'),
        loginMessage:   () => cy.get('#l-msg'),
    }

    // --- Product Actions ---
    addProductByName(name) {
        cy.contains('.pcard-name', name).should('be.visible').closest('.pcard').find('.add-btn').click()
    }

    addProductByIndex(index) {
        cy.get('.pcard').eq(index).find('.add-btn').should('be.visible').click()
    }

    // --- Search & Filter ---
    searchFor(text) {
        this.elements.searchInput().clear().type(text)
    }

    filterByCategory(category) {
        cy.get('.fchip').contains(category).should('be.visible').click()
    }

    // --- Cart ---
    openCart() {
        this.elements.cartPill().should('be.visible').click()
    }

    proceedToCheckout() {
        this.elements.checkoutBtn().should('be.visible').click()
    }

    // --- Auth ---
    openLogin() {
        this.elements.loginButton().should('be.visible').click()
    }

    openSignup() {
        this.elements.signUpButton().should('be.visible').click()
    }

    login(email, password) {
        this.elements.loginEmail().clear().type(email)
        this.elements.loginPassword().clear().type(password)
        cy.get('#form-login .msubmit').should('be.visible').click()
    }

    signup(name, email, password) {
        this.elements.signupName().clear().type(name)
        this.elements.signupEmail().clear().type(email)
        this.elements.signupPassword().clear().type(password)
        cy.get('#form-signup .msubmit').should('be.visible').click()
    }

    logout() {
        cy.get('#user-chip').find('button').contains('Out').click()
    }

    // --- Verify Methods (specs call ONLY these) ---
    verifyCartCount(expected) {
        this.elements.cartCount().should('be.visible').and('contain', expected)
    }

    verifyProductInCart(productName) {
        cy.contains('.ci-name', productName).should('be.visible')
    }

    verifyCartPriceInDrawer(expectedPrice) {
        cy.get('.ci-sub').should('contain', expectedPrice)
    }

    verifyDrawerOpen() {
        this.elements.drawer().should('have.class', 'open')
    }

    verifySignupMessage(expected) {
        this.elements.signupMessage().should('contain', expected)
    }

    verifyLoginMessage(expected) {
        this.elements.loginMessage().should('contain', expected)
    }

    verifyUserChipVisible(expectedName) {
        this.elements.userChip().should('be.visible')
        this.elements.unameLabel().should('contain', expectedName)
    }

    verifyAuthButtonsNotVisible() {
        cy.get('#auth-btns').should('not.be.visible')
    }

    verifyProductCount(expected) {
        cy.get('.pcard').should('have.length', expected)
    }

    verifyNoResults() {
        cy.get('#no-results').should('be.visible')
    }

    verifyResultsInfo(expected) {
        cy.get('#results-info').should('contain', expected)
    }

    verifyFilterActive(category) {
        cy.get('.fchip').contains(category).should('have.class', 'active')
    }

    verifyAuthModalVisible() {
        this.elements.authModal().should('be.visible')
    }

    verifyUrl(expected) {
        cy.url().should('include', expected)
    }
}
export default HomePage
