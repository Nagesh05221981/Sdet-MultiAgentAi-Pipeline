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
    homePage.verifyAuthModalVisible()
    homePage.signup(
      testData.users.newUser.name,
      testData.users.newUser.email,
      testData.users.newUser.password
    )
    homePage.verifySignupMessage(testData.appMessages.signup.success)
    homePage.verifyUserChipVisible(testData.users.newUser.name.split(' ')[0])
    homePage.verifyAuthButtonsNotVisible()
  })

  it('TC-002: Signup with Empty Fields', () => {
    cy.visit('/index.html')
    homePage.openSignup()
    homePage.verifyAuthModalVisible()
    homePage.signup(
      ' ',
      testData.users.newUser.email,
      testData.users.newUser.password
    )
    homePage.verifySignupMessage(testData.appMessages.signup.emptyFields)
  })

  it('TC-003: Signup with Invalid Email', () => {
    cy.visit('/index.html')
    homePage.openSignup()
    homePage.verifyAuthModalVisible()
    homePage.signup(
      testData.users.invalidEmail.name,
      testData.users.invalidEmail.email,
      testData.users.invalidEmail.password
    )
    homePage.verifySignupMessage(testData.appMessages.signup.invalidEmail)
  })

  it('TC-004: Signup with Short Password', () => {
    cy.visit('/index.html')
    homePage.openSignup()
    homePage.verifyAuthModalVisible()
    homePage.signup(
      testData.users.shortPassword.name,
      testData.users.shortPassword.email,
      testData.users.shortPassword.password
    )
    homePage.verifySignupMessage(testData.appMessages.signup.shortPassword)
  })

  it('TC-005: Signup with Duplicate Account', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          'nova_users',
          JSON.stringify(testData.stateSeeding.existingUserForDuplicate.localStorage.nova_users)
        )
      }
    })
    homePage.openSignup()
    homePage.verifyAuthModalVisible()
    homePage.signup(
      testData.users.existingUser.name,
      testData.users.existingUser.email,
      testData.users.existingUser.password
    )
    homePage.verifySignupMessage(testData.appMessages.signup.duplicateAccount)
  })
})
