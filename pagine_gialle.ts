import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Utility function to clean messy strings
const cleanString = (str: string): string => {
  return str
    .replace(/\s+/g, ' ')           // Replace multiple whitespace with single space
    .replace(/\n/g, ' ')            // Replace newlines with spaces
    .replace(/\r/g, ' ')            // Replace carriage returns with spaces
    .replace(/\t/g, ' ')            // Replace tabs with spaces
    .trim()                         // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ');          // Clean up any remaining multiple spaces
}

// Advanced cleaning function for specific data types
const cleanLocation = (location: string): string => {
  return cleanString(location)
    .replace(/\s*-\s*/g, ' - ')     // Normalize dashes with spaces
    .replace(/\s*,\s*/g, ', ')      // Normalize commas with spaces
    .replace(/\s*\(\s*/g, ' (')     // Normalize opening parentheses
    .replace(/\s*\)\s*/g, ')')      // Normalize closing parentheses
    .replace(/\s+/g, ' ')           // Final cleanup of multiple spaces
    .trim();
}

const cleanPhoneNumber = (phone: string): string => {
  return phone;
}

// CSV utility functions
const escapeCSV = (str: string): string => {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const extractMobileNumber = (business: any): string => {
  // First try to extract from WhatsApp link
  if (business.whatsappLink) {
    // Handle different WhatsApp link formats
    const whatsappMatch = business.whatsappLink.match(/wa\.me\/(\+?)(\d+)/);
    if (whatsappMatch) {
      return whatsappMatch[1] + whatsappMatch[2]; // Preserve + if present
    }
  }

  // Then look for first phone number starting with 3 (Italian mobile numbers)
  const mobileNumber = business.phoneNumbers.find((phone: string) => {
    const cleanPhone = phone.replace(/\s+/g, '');
    return cleanPhone.startsWith('3') || cleanPhone.startsWith('+393') || cleanPhone.startsWith('00393');
  });

  if (mobileNumber) {
    return mobileNumber.replace(/\s+/g, '');
  }

  return '';
}

const businessToCSVRow = (business: any): string => {
  const mobile = extractMobileNumber(business);
  const phone1 = business.phoneNumbers[0] || '';
  const phone2 = business.phoneNumbers[1] || '';
  const phone3 = business.phoneNumbers[2] || '';

  return [
    escapeCSV(business.name),
    escapeCSV(business.industry),
    escapeCSV(business.location),
    escapeCSV(mobile),
    escapeCSV(phone1),
    escapeCSV(phone2),
    escapeCSV(phone3),
    escapeCSV(business.whatsappLink || ''),
    escapeCSV(business.businessUrl)
  ].join(',');
}

const saveToCSV = (businesses: any[], filename: string, isAppend: boolean = false): void => {
  const csvHeader = 'Name,Industry,Location,Mobile,Phone1,Phone2,Phone3,WhatsApp Link,Business URL\n';
  const csvContent = businesses.map(businessToCSVRow).join('\n');

  if (isAppend && fs.existsSync(filename)) {
    fs.appendFileSync(filename, csvContent + '\n');
  } else {
    fs.writeFileSync(filename, csvHeader + csvContent + '\n');
  }
}

// Resume functionality
const getLastScrapedCount = (url: string): number => {
  const csvFile = `${url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_').replace('20', '').toLowerCase()}.csv`;
  if (!fs.existsSync(csvFile)) {
    return 0;
  }

  const content = fs.readFileSync(csvFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  return Math.max(0, lines.length - 1); // Subtract 1 for header
}

const getEstimatedStartPage = (scrapedCount: number): number => {
  // Estimate starting page based on scraped count (assuming ~20 businesses per page)
  return Math.floor(scrapedCount / 20) + 1;
}

async function scrapePagineGialle(url: string) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    let allBusinesses: any[] = [];
    let pageNumber = 1;
    let hasMoreResults = true;
    const maxPages = 50; // Safety limit to prevent infinite loops

    // Resume functionality
    const lastScrapedCount = getLastScrapedCount(url);
    const csvFile = `${url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_').replace('20', '').toLowerCase()}.csv`;
    let totalScraped = lastScrapedCount;

    if (lastScrapedCount > 0) {
      const estimatedStartPage = getEstimatedStartPage(lastScrapedCount);
      console.log(`Resuming from previous session: ${lastScrapedCount} businesses already scraped`);
      console.log(`Estimated starting page: ${estimatedStartPage}`);

      // Navigate to estimated page
      for (let i = 1; i < estimatedStartPage; i++) {
        const hasMoreButton = await page.evaluate(() => {
          const showMoreButton = document.querySelector('.next-page-btn');
          return showMoreButton !== null;
        });

        if (hasMoreButton) {
          await page.evaluate(() => {
            const showMoreButton = document.querySelector('.next-page-btn') as HTMLElement;
            if (showMoreButton) {
              showMoreButton.click();
            }
          });
          await new Promise(resolve => setTimeout(resolve, 3000));
          pageNumber++;
        } else {
          break;
        }
      }
    } else {
      console.log('Starting fresh scraping session');
    }

    while (hasMoreResults && pageNumber <= maxPages) {
      console.log(`\n--- Scraping page ${pageNumber} ---`);

      // Click all "Telefono" buttons to reveal phone numbers
      await page.evaluate(() => {
        const phoneButtons = document.querySelectorAll('a[data-pag="mostra telefono"]');
        phoneButtons.forEach(button => {
          (button as HTMLElement).click();
        });
      });

      // Wait a bit for the phone numbers to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      const businesses = await page.evaluate(() => {
        const listings = document.querySelectorAll('.search-itm.js-shiny-data-user');

        return Array.from(listings).map(listing => {
          // Extract business name
          const nameElement = listing.querySelector('h2.search-itm__rag');
          const name = nameElement ? nameElement.textContent?.trim() : '';

          // Extract industry/category
          const categoryElement = listing.querySelector('.search-itm__category');
          const industry = categoryElement ? categoryElement.textContent?.trim() : '';

          // Extract location/address
          const addressElement = listing.querySelector('.search-itm__adr');
          const location = addressElement ? addressElement.textContent?.trim() : '';

          // Extract phone numbers (they're hidden initially, need to click to reveal)
          const phoneContainer = listing.querySelector('.search-itm__phone');
          const phoneNumbers: string[] = [];
          if (phoneContainer) {
            const phoneElements = phoneContainer.querySelectorAll('li');
            phoneElements.forEach(li => {
              const phoneText = li.textContent?.trim();
              if (phoneText) {
                phoneNumbers.push(phoneText);
              }
            });
          }

          // Extract WhatsApp link
          const whatsappElement = listing.querySelector('a[href*="wa.me"]');
          const whatsappLink = whatsappElement ? whatsappElement.getAttribute('href') : '';

          // Extract business URL
          const businessLinkElement = listing.querySelector('a[href*="paginegialle.it"][title]');
          const businessUrl = businessLinkElement ? businessLinkElement.getAttribute('href') : '';

          return {
            name,
            industry,
            location,
            phoneNumbers,
            whatsappLink: whatsappLink?.split('?')[0],
            businessUrl
          };
        });
      });

      // Clean the extracted data for this page
      const cleanedBusinesses = businesses.map(business => ({
        name: cleanString(business.name),
        industry: cleanString(business.industry),
        location: cleanLocation(business.location),
        phoneNumbers: business.phoneNumbers.map(phone => cleanPhoneNumber(phone)),
        whatsappLink: business.whatsappLink,
        businessUrl: business.businessUrl
      }));

      console.log(`Found ${cleanedBusinesses.length} businesses on page ${pageNumber}`);

      // Add to our collection
      allBusinesses = allBusinesses.concat(cleanedBusinesses);
      totalScraped += cleanedBusinesses.length;

      // Save to CSV every 20 businesses
      if (allBusinesses.length >= 20) {
        const isAppend = lastScrapedCount > 0 || fs.existsSync(csvFile);
        saveToCSV(allBusinesses, csvFile, isAppend);
        console.log(`CSV saved: ${totalScraped} total businesses (${allBusinesses.length} new this session)`);
        allBusinesses = []; // Clear the array to save memory
      }

      // Check if there's a "MOSTRA ALTRI RISULTATI" button
      const hasMoreButton = await page.evaluate(() => {
        const showMoreButton = document.querySelector('.next-page-btn');
        return showMoreButton !== null;
      });

      if (hasMoreButton) {
        console.log('Loading more results...');

        // Click the "MOSTRA ALTRI RISULTATI" button
        await page.evaluate(() => {
          const showMoreButton = document.querySelector('.next-page-btn') as HTMLElement;
          if (showMoreButton) {
            showMoreButton.click();
          }
        });

        // Wait for new content to load (rate limiting)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Wait for new listings to appear
        try {
          await page.waitForSelector('.search-itm.js-shiny-data-user', { timeout: 10000 });
        } catch (error) {
          console.log('No more results found or timeout waiting for new content');
          hasMoreResults = false;
        }

        pageNumber++;
      } else {
        console.log('No more results button found. Scraping complete.');
        hasMoreResults = false;
      }
    }

    if (pageNumber > maxPages) {
      console.log(`\nReached maximum page limit (${maxPages}). Stopping to prevent infinite loop.`);
    }

    // Save any remaining businesses to CSV
    if (allBusinesses.length > 0) {
      const isAppend = lastScrapedCount > 0 || fs.existsSync(csvFile);
      saveToCSV(allBusinesses, csvFile, isAppend);
      totalScraped += allBusinesses.length;
    }

    console.log(`\n=== SCRAPING COMPLETE ===`);
    console.log(`Total businesses scraped this session: ${totalScraped - lastScrapedCount}`);
    console.log(`Total businesses in CSV file: ${totalScraped}`);
    console.log(`CSV file saved as: ${csvFile}`);

    // Display sample of results (first 5)
    if (allBusinesses.length > 0) {
      console.log(`\nSample of last scraped businesses:`);
      allBusinesses.slice(0, 5).forEach((business, index) => {
        const mobile = extractMobileNumber(business);
        console.log(`\n${index + 1}. ${business.name}`);
        console.log(`   Industry: ${business.industry}`);
        console.log(`   Location: ${business.location}`);
        console.log(`   Mobile: ${mobile || 'Not found'}`);
        console.log(`   Phone1: ${business.phoneNumbers[0] || 'N/A'}`);
        console.log(`   Phone2: ${business.phoneNumbers[1] || 'N/A'}`);
        console.log(`   Phone3: ${business.phoneNumbers[2] || 'N/A'}`);
        console.log(`   WhatsApp: ${business.whatsappLink || 'Not available'}`);
        console.log(`   URL: ${business.businessUrl}`);
      });
    }

  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
}

// Run the scraper
const main = async () => {
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Agenzie%20marketing').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Agenzie%20immobiliari').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Agenzia%20viaggi').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Agenzia%20assicurazione').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Agenzie%20interinali').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Commercialisti').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Notai').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Studio%20legale').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Studio%20tecnico').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Studio%20tributario').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Avvocati').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Architetti').catch(console.error);
  await scrapePagineGialle('https://www.paginegialle.it/ricerca/Dentisti').catch(console.error);
}

main();