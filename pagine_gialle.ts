import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Array delle principali città italiane, una per ogni regione (capoluoghi di regione)
export const principaliCittaItalia: string[] = [
  "Roma",            // Lazio
  "Milano",          // Lombardia
  "Napoli",          // Campania
  "Torino",          // Piemonte
  "Palermo",         // Sicilia
  "Genova",          // Liguria
  "Bologna",         // Emilia-Romagna
  "Firenze",         // Toscana
  "Venezia",         // Veneto
  "Bari",            // Puglia
  "Cagliari",        // Sardegna
  "Ancona",          // Marche
  "L'Aquila",        // Abruzzo
  "Potenza",         // Basilicata
  "Catanzaro",       // Calabria
  "Perugia",         // Umbria
  "Trieste",         // Friuli Venezia Giulia
  "Aosta",           // Valle d'Aosta
  "Trento",          // Trentino-Alto Adige/Südtirol
  "Campobasso"       // Molise
];

// Array di città secondarie italiane, almeno una per ogni regione (esempi rappresentativi)
export const cittaSecondarieItalia: string[] = [
  // Lombardia
  "Bergamo", "Brescia", "Monza", "Como", "Pavia", "Varese", "Cremona", "Mantova", "Lecco", "Lodi", "Sondrio",
  // Lazio
  "Latina", "Frosinone", "Viterbo", "Rieti",
  // Campania
  "Salerno", "Caserta", "Avellino", "Benevento",
  // Piemonte
  "Novara", "Alessandria", "Asti", "Cuneo", "Biella", "Vercelli", "Verbano-Cusio-Ossola",
  // Sicilia
  "Catania", "Messina", "Siracusa", "Trapani", "Ragusa", "Agrigento", "Enna", "Caltanissetta",
  // Liguria
  "La Spezia", "Savona", "Imperia",
  // Emilia-Romagna
  "Modena", "Parma", "Reggio nell'Emilia", "Ravenna", "Ferrara", "Forlì", "Cesena", "Piacenza", "Rimini",
  // Toscana
  "Prato", "Livorno", "Pisa", "Arezzo", "Siena", "Grosseto", "Massa", "Carrara", "Lucca", "Pistoia",
  // Veneto
  "Verona", "Padova", "Vicenza", "Treviso", "Rovigo", "Belluno",
  // Puglia
  "Lecce", "Taranto", "Brindisi", "Foggia", "Barletta", "Andria", "Trani",
  // Sardegna
  "Sassari", "Nuoro", "Oristano", "Olbia", "Tempio Pausania", "Carbonia", "Iglesias",
  // Marche
  "Pesaro", "Urbino", "Macerata", "Ascoli Piceno", "Fermo",
  // Abruzzo
  "Pescara", "Chieti", "Teramo",
  // Basilicata
  "Matera",
  // Calabria
  "Reggio di Calabria", "Cosenza", "Crotone", "Vibo Valentia",
  // Umbria
  "Terni",
  // Friuli Venezia Giulia
  "Udine", "Pordenone", "Gorizia",
  // Valle d'Aosta
  // (Aosta è l'unica città principale)
  // Trentino-Alto Adige/Südtirol
  "Bolzano", "Merano", "Rovereto",
  // Molise
  "Isernia"
];

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
const getLastScrapedCount = (url: string, city: string): number => {
  const csvFile = `${url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_').replace('20', '').toLowerCase()}.csv`;
  if (!fs.existsSync(csvFile)) {
    return 0;
  }

  const content = fs.readFileSync(csvFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim()).filter(line => line.includes(city));
  return Math.max(0, lines.length - 1); // Subtract 1 for header
}

async function scrapePagineGialle(url: string) {
  const allCities = [...principaliCittaItalia, ...cittaSecondarieItalia];

  // Process cities in parallel batches of 5 to avoid overwhelming the server
  const batchSize = 5;
  for (let i = 0; i < allCities.length; i += batchSize) {
    const cityBatch = allCities.slice(i, i + batchSize);
    console.log(`\n=== Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allCities.length / batchSize)} ===`);

    // Process cities in parallel
    await Promise.all(
      cityBatch.map(city => scrapePagineGialleByCity(url, city))
    );

    // Small delay between batches to be respectful to the server
    if (i + batchSize < allCities.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function scrapePagineGialleByCity(url: string, city: string) {
  const browser = await puppeteer.launch({
    headless: true, // Much faster in headless mode
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const page = await browser.newPage();

    // Optimize page loading
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Disable images and CSS for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(`${url}/${city}`, { waitUntil: 'domcontentloaded' }); // Faster than networkidle2

    let allBusinesses: any[] = [];
    let hasMoreResults = true;
    let offset = 0; // Track how many companies we've already scraped

    // Resume functionality
    const lastScrapedCount = getLastScrapedCount(url, city);
    const csvFile = `${url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_').replace('20', '').toLowerCase()}.csv`;
    let totalScraped = lastScrapedCount;

    if (lastScrapedCount > 0) {
      if (lastScrapedCount > 100) {
        console.log('Last scraped count is greater than 200. Starting fresh scraping session.');
        return;
      }
      console.log(`Resuming from previous session: ${lastScrapedCount} businesses already scraped`);
      offset = lastScrapedCount; // Set offset to continue from where we left off

      // Load more results until we reach the offset
      let currentOffset = 0;
      while (currentOffset < offset) {
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
          //          await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 3000ms

          // Count current companies on page
          const currentCount = await page.evaluate(() => {
            return document.querySelectorAll('.search-itm.js-shiny-data-user').length;
          });
          currentOffset = currentCount;
        } else {
          break;
        }
      }
    } else {
      console.log('Starting fresh scraping session');
    }

    const MAX_NEW_BUSINESSES_RETRIES = 4;
    let newBusinessesRetries = 0;

    while (hasMoreResults) {
      console.log(`\n--- Scraping batch starting from offset ${offset} ---`);

      // Click all "Telefono" buttons to reveal phone numbers (optimized)
      await page.evaluate(() => {
        const phoneButtons = document.querySelectorAll('a[data-pag="mostra telefono"]');
        phoneButtons.forEach(button => {
          (button as HTMLElement).click();
        });
      });

      // Minimal wait for phone numbers to load
      await new Promise(resolve => setTimeout(resolve, 500));

      const businesses = await page.evaluate((startOffset) => {
        const listings = document.querySelectorAll('.search-itm.js-shiny-data-user');
        const listingsToProcess = Array.from(listings).slice(startOffset);

        return listingsToProcess.map(listing => {
          // Optimized extraction with single query per element
          const getText = (selector: string) => {
            const el = listing.querySelector(selector);
            return el?.textContent?.trim() || '';
          };

          const getAttr = (selector: string, attr: string) => {
            const el = listing.querySelector(selector);
            return el?.getAttribute(attr) || '';
          };

          // Extract phone numbers efficiently
          const phoneNumbers: string[] = [];
          const phoneContainer = listing.querySelector('.search-itm__phone');
          if (phoneContainer) {
            const phoneElements = phoneContainer.querySelectorAll('li');
            for (const li of phoneElements) {
              const phoneText = li.textContent?.trim();
              if (phoneText) phoneNumbers.push(phoneText);
            }
          }

          return {
            name: getText('h2.search-itm__rag'),
            industry: getText('.search-itm__category'),
            location: getText('.search-itm__adr'),
            phoneNumbers,
            whatsappLink: getAttr('a[href*="wa.me"]', 'href')?.split('?')[0] || '',
            businessUrl: getAttr('a[href*="paginegialle.it"][title]', 'href') || ''
          };
        });
      }, offset);

      // Clean the extracted data for this batch
      const cleanedBusinesses = businesses.map(business => ({
        name: cleanString(business.name),
        industry: cleanString(business.industry),
        location: cleanLocation(business.location),
        phoneNumbers: business.phoneNumbers.map(phone => cleanPhoneNumber(phone)),
        whatsappLink: business.whatsappLink,
        businessUrl: business.businessUrl
      }));

      console.log(`Found ${cleanedBusinesses.length} new businesses (offset: ${offset})`);
      if (cleanedBusinesses.length === 0) {
        newBusinessesRetries++;
        if (newBusinessesRetries > MAX_NEW_BUSINESSES_RETRIES) {
          console.log('No new businesses found. Stopping scraping.');
          hasMoreResults = false;
          break;
        }
      }

      // Add to our collection
      allBusinesses = allBusinesses.concat(cleanedBusinesses);
      totalScraped += cleanedBusinesses.length;
      offset += cleanedBusinesses.length; // Update offset for next batch

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

        // Minimal wait for new content to load
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Wait for new listings to appear with shorter timeout
        try {
          await page.waitForSelector('.search-itm.js-shiny-data-user', { timeout: 2000 });
          hasMoreResults = totalScraped < 200;
        } catch (error) {
          console.log('No more results found or timeout waiting for new content');
          hasMoreResults = false;
        }
      } else {
        console.log('No more results button found. Scraping complete.');
        hasMoreResults = false;
      }
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