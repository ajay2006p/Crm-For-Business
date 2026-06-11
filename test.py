from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://www.google.com/maps")
    page.wait_for_timeout(5000)
    
    inputs = page.locator('input').element_handles()
    for el in inputs:
        print("INPUT:", el.get_attribute("id"), el.get_attribute("name"), el.get_attribute("aria-label"), el.get_attribute("class"))
    
    browser.close()
