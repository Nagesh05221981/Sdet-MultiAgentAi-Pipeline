# User Signup

## User Story
As a new visitor, I want to create an account so that I can have a personalized shopping experience.

## Acceptance Criteria

1. **Open signup modal**: When I click the "Sign Up" button in the navigation, the auth modal should open with the Sign Up tab active.
2. **Fill signup form**: I should be able to enter my full name, email address, and password.
3. **Successful signup**: When I submit valid details, I should see a success message and be automatically signed in.
4. **User chip visible**: After signing up, my first name should appear in the user chip in the navigation, and the Login/Sign Up buttons should be hidden.
5. **Validation — empty fields**: If I submit with any empty field, an error message should appear.
6. **Validation — invalid email**: If I enter an invalid email format, an error message should appear.
7. **Validation — short password**: If my password is less than 6 characters, an error message should appear.
8. **Duplicate account**: If I try to sign up with an email that already exists, an error message should appear.
