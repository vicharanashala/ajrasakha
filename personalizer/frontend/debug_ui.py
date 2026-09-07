from selenium import webdriver
from selenium.webdriver.common.by import By
import time

options = webdriver.ChromeOptions()
options.add_argument('--headless')
options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

driver = webdriver.Chrome(options=options)
driver.get('http://localhost:3145')

time.sleep(2)
try:
    map_el = driver.find_element(By.CLASS_NAME, 'leaflet-container')
    map_el.click()
    time.sleep(2)
    
    input_el = driver.find_element(By.CSS_SELECTOR, 'input[type="text"]')
    input_el.send_keys('hello')
    
    btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
    btn.click()
    
    time.sleep(2)
    
    logs = driver.get_log('browser')
    for entry in logs:
        print(entry)
except Exception as e:
    print('Error:', e)
finally:
    driver.quit()
