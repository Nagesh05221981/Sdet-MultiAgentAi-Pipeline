import HomePage from '../support/pages/home-page.js'

describe('User Signup', () => {
  const homePage = new HomePage()
  let testData

  beforeEach(() => {
    cy.fixture('test-data').then(data => { testData = data })
  })

  it('TC-001: Successful User Signup', () => {
    cy.visit('/index.html')
    homePage.openSignup()
    homePage.signup(testData.users.newUser.name, testData.users.newUser.email, testData.users.newUser.password)
    homePage.verifySignupMessage('✓ Account created! Signing you in…')
    homePage.verifyUserChipVisible(testData.users.newUser.name.split(' ')[0])
    homePage.verifyAuthButtonsNotVisible()
  })

  it('TC-002: Signup with Empty Fields', () => {
    cy.visit('/index.html')
    homePage.openSignup()
    homePage.signup(' ', testData.users.newUser.email, testData.users.newUser.password)
    homePage.verifySignupMessage('Please fill in all fields.')
  })

  it('TC-003: Signup with Invalid Email', () => {
    cy.visit('/index.html')
    homePage.openSignup()
    homePage.signup(testData.users.invalidEmail.name, testData.users.invalidEmail.email, testData.users.invalidEmail.password)
    homePage.verifySignupMessage('Invalid email address.')
  })

  it('TC-004: Signup with Short Password', () => {
    cy.visit('/index.html')
    homePage.openSignup()
    homePage.signup(testData.users.shortPassword.name, testData.users.shortPassword.email, testData.users.shortPassword.password)
    homePage.verifySignupMessage('Password must be at least 6 characters.')
  })

  it('TC-005: Signup with Duplicate Account', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_users', JSON.stringify(testData.existingUserForDuplicate.localStorage.nova_users))
      }
    })
    homePage.openSignup()
    homePage.signup(testData.users.existingUser.name, testData.users.existingUser.email, testData.users.existingUser.password)
    homePage.verifySignupMessage('Account already exists. Try logging in.')
  })
})
