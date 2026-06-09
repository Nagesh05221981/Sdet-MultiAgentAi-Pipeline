import HomePage from '../support/pages/home-page.js'

describe('Browse Products', () => {
  const homePage = new HomePage()
  let testData

  beforeEach(() => {
    cy.fixture('test-data').then(data => { testData = data })
  })

  it('TC-001: View all products on homepage', () => {
    cy.visit('/index.html')
    homePage.verifyProductCount(18)
  })

  it('TC-002: Search for a product by name', () => {
    cy.visit('/index.html')
    homePage.searchFor(testData.search.validTerm)
    homePage.verifyResultsInfo('1 product')
  })

  it('TC-003: Search with no results', () => {
    cy.visit('/index.html')
    homePage.searchFor(testData.search.noResultsTerm)
    homePage.verifyNoResults()
  })

  it('TC-004: Filter products by category', () => {
    cy.visit('/index.html')
    homePage.filterByCategory(testData.search.categoryFilter)
    homePage.verifyFilterActive(testData.search.categoryFilter)
  })

  it('TC-005: Reset filters to view all products', () => {
    cy.visit('/index.html')
    homePage.filterByCategory(testData.search.categoryFilter)
    homePage.filterByCategory('All')
    homePage.verifyProductCount(18)
  })

  it('TC-006: Combined search and filter', () => {
    cy.visit('/index.html')
    homePage.filterByCategory(testData.search.categoryFilter)
    homePage.searchFor(testData.search.validTerm)
    homePage.verifyResultsInfo('1 product')
  })
})
