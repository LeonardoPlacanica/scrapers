import * as fs from 'fs';
import * as path from 'path';

interface ProductRow {
  [key: string]: string;
}

interface ProductGroup {
  title: string;
  rows: ProductRow[];
  firstRowIndex: number;
}

class ShopifyProductVariantProcessor {
  private csvPath: string;
  private outputPath: string;
  private csvData: string[][] = [];
  private headers: string[] = [];

  constructor(csvPath: string, outputPath?: string) {
    this.csvPath = csvPath;
    this.outputPath = outputPath || csvPath.replace('.csv', '_processed.csv');
  }

  /**
   * Read and parse the CSV file
   */
  private readCSV(): void {
    try {
      const fileContent = fs.readFileSync(this.csvPath, 'utf-8');

      // Parse CSV with proper multi-line field handling
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentField = '';
      let inQuotes = false;
      let i = 0;

      while (i < fileContent.length) {
        const char = fileContent[i];
        const nextChar = i + 1 < fileContent.length ? fileContent[i + 1] : '';

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote - add one quote to current field and skip the next
            currentField += '"';
            i += 2; // Skip both quotes
            continue;
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // Field separator
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\n' && !inQuotes) {
          // Row separator (only when not in quotes)
          currentRow.push(currentField);
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        } else if (char !== '\r') {
          // Add character to current field (skip \r)
          currentField += char;
        }

        i++;
      }

      // Add the last field and row
      currentRow.push(currentField);
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }

      this.csvData = rows;
      this.headers = this.csvData[0];
      console.log(`Loaded ${this.csvData.length - 1} data rows from CSV`);
    } catch (error) {
      throw new Error(`Failed to read CSV file: ${error}`);
    }
  }

  /**
   * Group products by title (case-insensitive)
   */
  private groupProductsByTitle(): ProductGroup[] {
    const groups: { [key: string]: ProductGroup } = {};

    for (let i = 1; i < this.csvData.length; i++) {
      const row = this.csvData[i];
      const title = row[1]?.trim(); // Column B (index 1) is Title

      if (!title) continue;

      if (!groups[title]) {
        groups[title] = {
          title: title,
          rows: [],
          firstRowIndex: i
        };
      }

      groups[title].rows.push({
        ...this.headers.reduce((acc, header, index) => {
          acc[header] = row[index] || '';
          return acc;
        }, {} as ProductRow),
        _rowIndex: i.toString()
      });
    }

    return Object.values(groups);
  }

  /**
   * Sort all rows by Handle column (index 0)
   */
  private sortRowsByHandle(): void {
    // Sort all data rows (excluding header) by Handle column
    const headerRow = this.csvData[0];
    const dataRows = this.csvData.slice(1);

    dataRows.sort((a, b) => {
      const handleA = a[0] || ''; // Handle column (index 0)
      const handleB = b[0] || '';
      return handleA.localeCompare(handleB);
    });

    // Reconstruct the CSV data with sorted rows
    this.csvData = [headerRow, ...dataRows];
  }

  /**
   * Clear columns B-I for variant rows (keep only first product row)
   */
  private clearVariantColumns(group: ProductGroup): void {
    const columnsToClear = [1, 2, 3, 4, 5, 6, 7, 8]; // B-I columns (0-indexed: 1-8)

    // Keep the first row intact, clear the rest
    for (let i = 1; i < group.rows.length; i++) {
      const rowIndex = parseInt(group.rows[i]._rowIndex);

      this.csvData[rowIndex][0] = this.csvData[0][0];
      columnsToClear.forEach(colIndex => {
        this.csvData[rowIndex][colIndex] = '';
      });
    }
  }

  /**
   * Fix Image Position values to be sequential
   */
  private fixImagePositions(group: ProductGroup): void {
    const imageSrcColIndex = 31; // Column AF (0-indexed: 31)
    const imagePosColIndex = 32; // Column AG (0-indexed: 32)

    let positionCounter = 1;
    let firstImageSrc = '';

    // First pass: collect all unique image sources and their positions
    const imageSources: string[] = [];

    for (let i = 0; i < group.rows.length; i++) {
      const rowIndex = parseInt(group.rows[i]._rowIndex);
      const currentImageSrc = this.csvData[rowIndex][imageSrcColIndex];

      if (currentImageSrc && currentImageSrc.trim() !== '') {
        if (!imageSources.includes(currentImageSrc)) {
          imageSources.push(currentImageSrc);
        }
      }
    }

    // Store the first image src for copying to blank cells
    if (imageSources.length > 0) {
      firstImageSrc = imageSources[0];
    }

    // Second pass: assign sequential positions
    for (let i = 0; i < group.rows.length; i++) {
      const rowIndex = parseInt(group.rows[i]._rowIndex);
      const currentImageSrc = this.csvData[rowIndex][imageSrcColIndex];

      // If this row has an image src, use it and increment position
      if (currentImageSrc && currentImageSrc.trim() !== '') {
        this.csvData[rowIndex][imagePosColIndex] = positionCounter.toString();
        positionCounter++;
      } else if (firstImageSrc && i > 0) {
        // Copy the first image src to blank cells
        this.csvData[rowIndex][imageSrcColIndex] = firstImageSrc;
        this.csvData[rowIndex][imagePosColIndex] = positionCounter.toString();
        positionCounter++;
      }
    }
  }

  /**
   * Sort variants by image position and move them directly under the first product
   */
  private sortVariantsByImagePosition(group: ProductGroup): void {
    const imagePosColIndex = 32; // Column AG (0-indexed: 32)
    const handleColIndex = 0; // Column A (0-indexed: 0)

    // Get all row indices for this group
    const rowIndices = group.rows.map(row => parseInt(row._rowIndex));
    const firstRowIndex = rowIndices[0];
    const variantRowIndices = rowIndices.slice(1);

    // Get the first product's handle
    const firstProductHandle = this.csvData[firstRowIndex][handleColIndex];

    // Sort variant rows by image position
    variantRowIndices.sort((a, b) => {
      const posA = parseInt(this.csvData[a][imagePosColIndex]) || 999;
      const posB = parseInt(this.csvData[b][imagePosColIndex]) || 999;
      return posA - posB;
    });

    // Update variant handles to match the first product
    variantRowIndices.forEach(variantIndex => {
      this.csvData[variantIndex][handleColIndex] = firstProductHandle;
    });

    // Move variant rows to be directly after the first product
    // We need to physically move the rows in the CSV data
    const firstProductRow = this.csvData[firstRowIndex];
    const variantRows = variantRowIndices.map(index => this.csvData[index]);

    // Remove the variant rows from their current positions
    const sortedIndices = [...variantRowIndices].sort((a, b) => b - a); // Sort descending to remove from end first
    sortedIndices.forEach(index => {
      this.csvData.splice(index, 1);
    });

    // Find the new position of the first product after removals
    const newFirstProductIndex = this.csvData.findIndex(row => row === firstProductRow);

    // Insert variant rows directly after the first product
    this.csvData.splice(newFirstProductIndex + 1, 0, ...variantRows);
  }

  /**
   * Process all product groups
   */
  public processProducts(): void {
    console.log('Starting product variant processing...');

    // Read CSV
    this.readCSV();

    // Sort all rows by Handle column first
    this.sortRowsByHandle();
    console.log('Sorted rows by Handle column');

    // Group products by title
    const productGroups = this.groupProductsByTitle();
    console.log(`Found ${productGroups.length} unique product groups`);

    // Process each group
    productGroups.forEach((group, index) => {
      console.log(`Processing group ${index + 1}/${productGroups.length}: "${group.title}" (${group.rows.length} variants)`);

      // Clear variant columns B-I for all rows except the first
      this.clearVariantColumns(group);

      // Fix image positions and copy image src
      this.fixImagePositions(group);

      // Sort variants by image position and ensure all have same handle
      this.sortVariantsByImagePosition(group);
    });

    // Write the processed CSV
    this.writeProcessedCSV();

    console.log(`Processing complete! Output saved to: ${this.outputPath}`);
  }

  /**
   * Write the processed CSV to file
   */
  private writeProcessedCSV(): void {
    const csvContent = this.csvData.map(row =>
      row.map(cell => {
        // Handle null/undefined cells
        const cellValue = cell || '';

        // Always escape quotes by doubling them
        const escapedCell = cellValue.replace(/"/g, '""');

        // Quote if contains comma, quote, newline, carriage return, or HTML tags
        const needsQuoting = cellValue.includes(',') ||
          cellValue.includes('"') ||
          cellValue.includes('\n') ||
          cellValue.includes('\r') ||
          cellValue.includes('<') ||
          cellValue.includes('>') ||
          cellValue.includes('&') ||
          cellValue.trim() === '';

        return needsQuoting ? `"${escapedCell}"` : escapedCell;
      }).join(',')
    ).join('\n');

    fs.writeFileSync(this.outputPath, csvContent, 'utf-8');
  }
}

// Main execution
const csvPath = '/Users/leonardoplacanica/Documents/Scrapers/products_export_1 (1).csv';
const processor = new ShopifyProductVariantProcessor(csvPath);

try {
  processor.processProducts();
} catch (error) {
  console.error('Error processing products:', error);
}
