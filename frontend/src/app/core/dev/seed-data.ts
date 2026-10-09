/** Temporary demo data for seeding the local SQLite DB; mirrors backend/db/seeds. */
export interface SeedProduct {
  readonly name: string;
  readonly sku: string;
  readonly barcode: string;
  readonly pctCode: string;
  readonly description: string;
  readonly unitPrice: string;
  readonly stockQuantity: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly unitCode: string;
  readonly taxCode: string;
}

export const SEED_UNITS: readonly (readonly [name: string, code: string, allowsFraction: boolean])[] = [
  ["Piece", "pcs", false],
  ["Kilogram", "kg", true],
  ["Gram", "g", true],
  ["Liter", "l", true],
  ["Milliliter", "ml", true],
  ["Meter", "m", true],
  ["Centimeter", "cm", true],
  ["Dozen", "dz", false],
  ["Pack", "pack", false],
  ["Box", "box", false],
  ["Carton", "ctn", false],
  ["Bottle", "btl", false],
  ["Bag", "bag", false],
  ["Pair", "pair", false],
  ["Set", "set", false],
  ["Roll", "roll", false],
  ["Sachet", "sachet", false],
  ["Can", "can", false],
  ["Packet", "pkt", false],
  ["Ton", "ton", true],
];

export const SEED_TAX_CATEGORIES: readonly (readonly [name: string, code: string, rate: number, isExempt: boolean])[] = [
  ["Standard Sales Tax (GST 18%)", "GST18", 18, false],
  ["Reduced Sales Tax (GST 10%)", "GST10", 10, false],
  ["Further Tax (3%)", "FURTHER3", 3, false],
  ["Zero Rated", "ZERO", 0, false],
  ["Exempt", "EXEMPT", 0, true],
];

export const SEED_PRODUCTS: readonly SeedProduct[] = [
  { name: "Tapal Danedar Tea 190g", sku: "TEA-001", barcode: "8888001000011", pctCode: "0902.3000", description: "Black tea leaves, 190g pack", unitPrice: "420.00", stockQuantity: "48", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Lipton Yellow Label Tea 95g", sku: "TEA-002", barcode: "8888001000028", pctCode: "0902.3001", description: "Black tea, 95g pack", unitPrice: "245.00", stockQuantity: "3", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Vital Tea 430g", sku: "TEA-003", barcode: "8888001000035", pctCode: "0902.4000", description: "Black tea, 430g pack", unitPrice: "780.00", stockQuantity: "22", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Sugar (loose)", sku: "GRC-001", barcode: "8888002000010", pctCode: "1701.9990", description: "Refined white sugar", unitPrice: "165.00", stockQuantity: "250.50", status: "ACTIVE", unitCode: "kg", taxCode: "ZERO" },
  { name: "Basmati Rice Super Kernel", sku: "GRC-002", barcode: "8888002000027", pctCode: "1006.3090", description: "Long grain basmati rice", unitPrice: "390.00", stockQuantity: "180.00", status: "ACTIVE", unitCode: "kg", taxCode: "ZERO" },
  { name: "Atta (Wheat Flour) 10kg", sku: "GRC-003", barcode: "8888002000034", pctCode: "1101.0000", description: "10kg wheat flour bag", unitPrice: "1450.00", stockQuantity: "35", status: "ACTIVE", unitCode: "bag", taxCode: "ZERO" },
  { name: "Gram Flour (Besan) 1kg", sku: "GRC-004", barcode: "8888002000041", pctCode: "1106.1000", description: "Chickpea flour", unitPrice: "320.00", stockQuantity: "4", status: "ACTIVE", unitCode: "pack", taxCode: "ZERO" },
  { name: "Red Lentils (Masoor Daal)", sku: "GRC-005", barcode: "8888002000058", pctCode: "0713.4000", description: "Split red lentils", unitPrice: "310.00", stockQuantity: "60.25", status: "ACTIVE", unitCode: "kg", taxCode: "ZERO" },
  { name: "Chickpeas (Kabuli Chana)", sku: "GRC-006", barcode: "8888002000065", pctCode: "0713.2000", description: "White chickpeas", unitPrice: "340.00", stockQuantity: "42.00", status: "ACTIVE", unitCode: "kg", taxCode: "ZERO" },
  { name: "Iodized Salt 800g", sku: "GRC-007", barcode: "8888002000072", pctCode: "2501.0010", description: "Table salt, 800g", unitPrice: "70.00", stockQuantity: "90", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Dalda Cooking Oil 1L", sku: "OIL-001", barcode: "8888003000019", pctCode: "1511.9000", description: "Cooking oil, 1 litre pouch", unitPrice: "620.00", stockQuantity: "75", status: "ACTIVE", unitCode: "pkt", taxCode: "GST18" },
  { name: "Habib Banaspati Ghee 1kg", sku: "OIL-002", barcode: "8888003000026", pctCode: "1516.2000", description: "Vegetable ghee, 1kg", unitPrice: "590.00", stockQuantity: "0", status: "ACTIVE", unitCode: "pkt", taxCode: "GST18" },
  { name: "Mustard Oil 500ml", sku: "OIL-003", barcode: "8888003000033", pctCode: "1514.1100", description: "Mustard oil bottle", unitPrice: "410.00", stockQuantity: "12", status: "ACTIVE", unitCode: "btl", taxCode: "GST18" },
  { name: "Olpers Full Cream Milk 1L", sku: "DRY-001", barcode: "8888004000015", pctCode: "0401.2000", description: "UHT milk, 1 litre", unitPrice: "295.00", stockQuantity: "120", status: "ACTIVE", unitCode: "pack", taxCode: "ZERO" },
  { name: "Nestle Milkpak 250ml", sku: "DRY-002", barcode: "8888004000022", pctCode: "0401.2001", description: "UHT milk, 250ml", unitPrice: "95.00", stockQuantity: "200", status: "ACTIVE", unitCode: "pack", taxCode: "ZERO" },
  { name: "Everyday Milk Powder 900g", sku: "DRY-003", barcode: "8888004000039", pctCode: "0402.2100", description: "Tea whitener, 900g", unitPrice: "1290.00", stockQuantity: "5", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Nestle Yogurt 400g", sku: "DRY-004", barcode: "8888004000046", pctCode: "0403.1000", description: "Plain yogurt cup", unitPrice: "180.00", stockQuantity: "18", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Farm Eggs", sku: "DRY-005", barcode: "8888004000053", pctCode: "0407.2100", description: "Fresh eggs, sold per dozen", unitPrice: "380.00", stockQuantity: "40", status: "ACTIVE", unitCode: "dz", taxCode: "ZERO" },
  { name: "Pepsi 1.5L", sku: "BEV-001", barcode: "8888005000012", pctCode: "2202.1010", description: "Carbonated soft drink, 1.5L", unitPrice: "190.00", stockQuantity: "96", status: "ACTIVE", unitCode: "btl", taxCode: "GST18" },
  { name: "Coca-Cola 345ml Can", sku: "BEV-002", barcode: "8888005000029", pctCode: "2202.1011", description: "Carbonated soft drink can", unitPrice: "110.00", stockQuantity: "144", status: "ACTIVE", unitCode: "can", taxCode: "GST18" },
  { name: "Nestle Pure Life Water 1.5L", sku: "BEV-003", barcode: "8888005000036", pctCode: "2201.1000", description: "Bottled drinking water", unitPrice: "90.00", stockQuantity: "300", status: "ACTIVE", unitCode: "btl", taxCode: "GST18" },
  { name: "Shezan Mango Juice 1L", sku: "BEV-004", barcode: "8888005000043", pctCode: "2009.8990", description: "Mango fruit drink", unitPrice: "270.00", stockQuantity: "2", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Rooh Afza 800ml", sku: "BEV-005", barcode: "8888005000050", pctCode: "2106.9020", description: "Rose syrup concentrate", unitPrice: "540.00", stockQuantity: "26", status: "ACTIVE", unitCode: "btl", taxCode: "GST18" },
  { name: "Lays Classic Chips 70g", sku: "SNK-001", barcode: "8888006000018", pctCode: "2005.2000", description: "Salted potato chips", unitPrice: "80.00", stockQuantity: "110", status: "ACTIVE", unitCode: "pkt", taxCode: "GST18" },
  { name: "Kurkure Chutney Chaska 60g", sku: "SNK-002", barcode: "8888006000025", pctCode: "1905.9090", description: "Corn puffs snack", unitPrice: "60.00", stockQuantity: "85", status: "ACTIVE", unitCode: "pkt", taxCode: "GST18" },
  { name: "Peek Freans Gluco Biscuits", sku: "SNK-003", barcode: "8888006000032", pctCode: "1905.3100", description: "Glucose biscuits family pack", unitPrice: "70.00", stockQuantity: "6", status: "ACTIVE", unitCode: "pkt", taxCode: "GST18" },
  { name: "Oreo Biscuits 6-Pack", sku: "SNK-004", barcode: "8888006000049", pctCode: "1905.3101", description: "Cream-filled biscuits", unitPrice: "90.00", stockQuantity: "64", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Dairy Milk Chocolate 40g", sku: "SNK-005", barcode: "8888006000056", pctCode: "1806.3200", description: "Milk chocolate bar", unitPrice: "150.00", stockQuantity: "0", status: "ACTIVE", unitCode: "pcs", taxCode: "GST18" },
  { name: "Surf Excel 1kg", sku: "HOM-001", barcode: "8888007000011", pctCode: "3402.2000", description: "Laundry detergent powder, 1kg", unitPrice: "560.00", stockQuantity: "38", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Lifebuoy Soap 130g", sku: "HOM-002", barcode: "8888007000028", pctCode: "3401.1100", description: "Antibacterial bath soap", unitPrice: "120.00", stockQuantity: "150", status: "ACTIVE", unitCode: "pcs", taxCode: "GST18" },
  { name: "Safeguard Soap 140g", sku: "HOM-003", barcode: "8888007000035", pctCode: "3401.1101", description: "Bath soap", unitPrice: "135.00", stockQuantity: "5", status: "ACTIVE", unitCode: "pcs", taxCode: "GST18" },
  { name: "Head & Shoulders Shampoo 360ml", sku: "HOM-004", barcode: "8888007000042", pctCode: "3305.1000", description: "Anti-dandruff shampoo", unitPrice: "780.00", stockQuantity: "20", status: "ACTIVE", unitCode: "btl", taxCode: "GST18" },
  { name: "Colgate Toothpaste 150g", sku: "HOM-005", barcode: "8888007000059", pctCode: "3306.1000", description: "Fluoride toothpaste", unitPrice: "290.00", stockQuantity: "45", status: "ACTIVE", unitCode: "pcs", taxCode: "GST18" },
  { name: "Harpic Toilet Cleaner 500ml", sku: "HOM-006", barcode: "8888007000066", pctCode: "3808.9400", description: "Toilet cleaner", unitPrice: "310.00", stockQuantity: "14", status: "ACTIVE", unitCode: "btl", taxCode: "GST18" },
  { name: "Dettol Antiseptic 250ml", sku: "HOM-007", barcode: "8888007000073", pctCode: "3808.9401", description: "Antiseptic liquid", unitPrice: "360.00", stockQuantity: "3", status: "ACTIVE", unitCode: "btl", taxCode: "GST18" },
  { name: "Tissue Roll (Pack of 4)", sku: "HOM-008", barcode: "8888007000080", pctCode: "4818.1000", description: "Soft toilet tissue rolls", unitPrice: "260.00", stockQuantity: "55", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Matchbox (Pack of 10)", sku: "HOM-009", barcode: "8888007000097", pctCode: "3605.0000", description: "Safety matches", unitPrice: "50.00", stockQuantity: "120", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Black Pepper Powder 100g", sku: "SPC-001", barcode: "8888008000016", pctCode: "0904.2200", description: "Ground black pepper", unitPrice: "250.00", stockQuantity: "30", status: "ACTIVE", unitCode: "pkt", taxCode: "GST10" },
  { name: "Red Chilli Powder 200g", sku: "SPC-002", barcode: "8888008000023", pctCode: "0904.2201", description: "Ground red chilli", unitPrice: "190.00", stockQuantity: "52", status: "ACTIVE", unitCode: "pkt", taxCode: "GST10" },
  { name: "Turmeric Powder 100g", sku: "SPC-003", barcode: "8888008000030", pctCode: "0910.3000", description: "Ground turmeric", unitPrice: "130.00", stockQuantity: "41", status: "ACTIVE", unitCode: "pkt", taxCode: "GST10" },
  { name: "National Biryani Masala 50g", sku: "SPC-004", barcode: "8888008000047", pctCode: "2103.9090", description: "Biryani spice mix", unitPrice: "105.00", stockQuantity: "1", status: "ACTIVE", unitCode: "sachet", taxCode: "GST10" },
  { name: "Potatoes", sku: "VEG-001", barcode: "8888009000013", pctCode: "0701.9000", description: "Fresh potatoes", unitPrice: "90.00", stockQuantity: "80.75", status: "ACTIVE", unitCode: "kg", taxCode: "ZERO" },
  { name: "Onions", sku: "VEG-002", barcode: "8888009000020", pctCode: "0703.1000", description: "Fresh onions", unitPrice: "110.00", stockQuantity: "65.50", status: "ACTIVE", unitCode: "kg", taxCode: "ZERO" },
  { name: "Tomatoes", sku: "VEG-003", barcode: "8888009000037", pctCode: "0702.0000", description: "Fresh tomatoes", unitPrice: "140.00", stockQuantity: "0.00", status: "ACTIVE", unitCode: "kg", taxCode: "ZERO" },
  { name: "Bananas", sku: "VEG-004", barcode: "8888009000044", pctCode: "0803.9000", description: "Fresh bananas, per dozen", unitPrice: "180.00", stockQuantity: "15", status: "ACTIVE", unitCode: "dz", taxCode: "ZERO" },
  { name: "Old Brand Tea 50g (Discontinued)", sku: "OLD-001", barcode: "8888010000019", pctCode: "0902.3002", description: "No longer stocked", unitPrice: "120.00", stockQuantity: "8", status: "INACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Seasonal Dates Box 1kg", sku: "OLD-002", barcode: "8888010000026", pctCode: "0804.1000", description: "Ramadan special, out of season", unitPrice: "850.00", stockQuantity: "0", status: "INACTIVE", unitCode: "box", taxCode: "EXEMPT" },
  { name: "Imported Cheese Slices 200g", sku: "DRY-006", barcode: "8888004000060", pctCode: "0406.9000", description: "Processed cheese slices", unitPrice: "640.00", stockQuantity: "9", status: "ACTIVE", unitCode: "pack", taxCode: "GST18" },
  { name: "Plastic Shopping Bags (100)", sku: "HOM-010", barcode: "8888007000103", pctCode: "3923.2100", description: "Carry bags, pack of 100", unitPrice: "220.00", stockQuantity: "28", status: "ACTIVE", unitCode: "pack", taxCode: "FURTHER3" },
  { name: "Phone Recharge Card Rs 100", sku: "SRV-001", barcode: "8888011000015", pctCode: "8523.5100", description: "Prepaid mobile top-up card", unitPrice: "100.00", stockQuantity: "500", status: "ACTIVE", unitCode: "pcs", taxCode: "EXEMPT" },
];
