import { PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD, DEMO_USERNAME, hashPassword } from "../src/lib/auth";
import {
  DELIVERY_DRIVER_OPTIONS,
  DELIVERY_VEHICLE_PLATE_OPTIONS
} from "../src/lib/delivery-options";
import { getCustomerPaymentBehaviour } from "../src/lib/customer-intelligence";
import { getCurrentMonthAverageSoldPrice } from "../src/lib/product-insights";
import { buildOrderTaxSnapshot } from "../src/lib/tax";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditTrail.deleteMany();
  await prisma.customerOutreach.deleteMany();
  await prisma.collectionTask.deleteMany();
  await prisma.deliveryNote.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customerInquiryItem.deleteMany();
  await prisma.customerInquiry.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  const adminUser = await prisma.user.create({
    data: {
      username: DEMO_USERNAME,
      passwordHash: hashPassword(DEMO_PASSWORD),
      displayName: "Admin Demo",
      role: "ADMIN",
      status: "Active"
    }
  });

  const salesUser = await prisma.user.create({
    data: {
      username: "sales",
      passwordHash: hashPassword("Sales123!"),
      displayName: "Sales Demo",
      role: "SALES",
      status: "Active"
    }
  });

  const managerUser = await prisma.user.create({
    data: {
      username: "manager",
      passwordHash: hashPassword("Manager123!"),
      displayName: "Manager Demo",
      role: "MANAGER",
      status: "Active"
    }
  });

  await prisma.product.createMany({
    data: [
      { productName: "Product Package A", listPrice: 1200000, status: "Active" },
      { productName: "Wholesale Package", listPrice: 800000, status: "Active" },
      { productName: "Retail Stock Package", listPrice: 550000, status: "Active" },
      { productName: "Corporate Supply Package", listPrice: 3200000, status: "Active" },
      { productName: "Seasonal Stock", listPrice: 1850000, status: "Active" },
      { productName: "Premium Material Set", listPrice: 1500000, status: "Active" },
      { productName: "Standard Material Set", listPrice: 900000, status: "Active" },
      { productName: "Custom Order Package", listPrice: 2500000, status: "Active" },
      { productName: "Installation Service", listPrice: 750000, status: "Active" },
      { productName: "Delivery Service", listPrice: 1800000, status: "Active" },
      { productName: "Handling Fee", listPrice: 150000, status: "Active" }
    ]
  });

  const productIdByName = new Map(
    (
      await prisma.product.findMany({
        select: { id: true, productName: true }
      })
    ).map((product) => [product.productName, product.id])
  );
  const getProductId = (productName: string) => {
    const productId = productIdByName.get(productName);
    if (!productId) {
      throw new Error(`Seed product not found: ${productName}`);
    }
    return productId;
  };

  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: "Andi Saputra",
        companyName: "PT Sinar Maju",
        phone: "0812-1000-1100",
        email: "andi@sinarmaju.example",
        address: "Jl. Merdeka No. 12, Bandung",
        npwp: "0123456789012345",
        customerSegment: "Retail",
        status: "Active",
        notes: "Long-term customer with regular monthly orders."
      }
    }),
    prisma.customer.create({
      data: {
        name: "Maya Lestari",
        companyName: "CV Bintang Niaga",
        phone: "0813-2000-2200",
        email: "maya@bintangniaga.example",
        address: "Jl. Cendana No. 7, Jakarta",
        customerSegment: "Wholesale",
        status: "Active",
        notes: "Usually pays by bank transfer."
      }
    }),
    prisma.customer.create({
      data: {
        name: "Rizky Pratama",
        companyName: "Toko Harapan",
        phone: "0815-3000-3300",
        email: "rizky@tokoharapan.example",
        address: "Jl. Diponegoro No. 21, Semarang",
        customerSegment: "Retail",
        status: "Active",
        notes: "Needs reminder before due date."
      }
    }),
    prisma.customer.create({
      data: {
        name: "Dewi Anggraeni",
        companyName: "PT Nusantara Jaya",
        phone: "0817-4000-4400",
        email: "dewi@nusantarajaya.example",
        address: "Jl. Veteran No. 9, Surabaya",
        npwp: "9876543210987654",
        customerSegment: "Corporate",
        status: "Active",
        notes: "Requests formal invoice copies."
      }
    }),
    prisma.customer.create({
      data: {
        name: "Budi Santoso",
        companyName: "UD Makmur Bersama",
        phone: "0819-5000-5500",
        email: "budi@makmurbersama.example",
        address: "Jl. Sudirman No. 31, Yogyakarta",
        customerSegment: "Wholesale",
        status: "Inactive",
        notes: "Inactive until next seasonal order."
      }
    }),
    prisma.customer.create({
      data: {
        name: "Nadia Permata",
        companyName: "PT Prospek Baru",
        phone: "0821-6000-6600",
        email: "nadia@prospekbaru.example",
        address: "Jl. Pemuda No. 18, Bogor",
        customerSegment: "Corporate",
        status: "Active",
        notes: "No eligible order history; demonstrates the No Payment History state."
      }
    })
  ]);

  const [
    sinarMaju,
    bintangNiaga,
    tokoHarapan,
    nusantaraJaya,
    makmurBersama
  ] = customers;

  const so001 = await prisma.salesOrder.create({
    data: {
      orderNumber: "SO-2026-001",
      customerId: sinarMaju.id,
      orderDate: new Date("2026-05-20"),
      status: "Invoiced",
      subtotal: 5400000,
      total: 5400000,
      ...buildOrderTaxSnapshot({
        totalAmount: 5400000,
        customerNpwp: sinarMaju.npwp
      }),
      paymentTermType: "IMMEDIATE",
      creditTermMonths: null,
      items: {
        create: [
          { productId: getProductId("Product Package A"), itemName: "Product Package A", quantity: 3, baseUnitPrice: 1200000, finalUnitPrice: 1200000, subtotal: 3600000 },
          { productId: getProductId("Delivery Service"), itemName: "Delivery Service", quantity: 1, baseUnitPrice: 1800000, finalUnitPrice: 1800000, subtotal: 1800000 }
        ]
      }
    }
  });

  const so002 = await prisma.salesOrder.create({
    data: {
      orderNumber: "SO-2026-002",
      customerId: bintangNiaga.id,
      orderDate: new Date("2026-05-24"),
      status: "Invoiced",
      subtotal: 3200000,
      total: 3200000,
      ...buildOrderTaxSnapshot({
        totalAmount: 3200000,
        customerNpwp: bintangNiaga.npwp
      }),
      paymentTermType: "CREDIT",
      creditTermMonths: 1,
      items: {
        create: [{ productId: getProductId("Wholesale Package"), itemName: "Wholesale Package", quantity: 4, baseUnitPrice: 800000, finalUnitPrice: 800000, subtotal: 3200000 }]
      }
    }
  });

  const so003 = await prisma.salesOrder.create({
    data: {
      orderNumber: "SO-2026-003",
      customerId: tokoHarapan.id,
      orderDate: new Date("2026-05-28"),
      status: "Invoiced",
      subtotal: 2750000,
      total: 2750000,
      ...buildOrderTaxSnapshot({
        totalAmount: 2750000,
        customerNpwp: tokoHarapan.npwp
      }),
      paymentTermType: "CREDIT",
      creditTermMonths: 3,
      items: {
        create: [{ productId: getProductId("Retail Stock Package"), itemName: "Retail Stock Package", quantity: 5, baseUnitPrice: 550000, finalUnitPrice: 550000, subtotal: 2750000 }]
      }
    }
  });

  const so004 = await prisma.salesOrder.create({
    data: {
      orderNumber: "SO-2026-004",
      customerId: nusantaraJaya.id,
      orderDate: new Date("2026-04-18"),
      status: "Invoiced",
      subtotal: 7900000,
      total: 7900000,
      ...buildOrderTaxSnapshot({
        totalAmount: 7900000,
        customerNpwp: nusantaraJaya.npwp
      }),
      paymentTermType: "CREDIT",
      creditTermMonths: 1,
      items: {
        create: [
          { productId: getProductId("Corporate Supply Package"), itemName: "Corporate Supply Package", quantity: 2, baseUnitPrice: 3200000, finalUnitPrice: 3200000, subtotal: 6400000 },
          { productId: getProductId("Handling Fee"), itemName: "Handling Fee", quantity: 1, baseUnitPrice: 1500000, finalUnitPrice: 1500000, subtotal: 1500000 }
        ]
      }
    }
  });

  const so005 = await prisma.salesOrder.create({
    data: {
      orderNumber: "SO-2026-005",
      customerId: makmurBersama.id,
      orderDate: new Date("2026-06-03"),
      status: "Invoiced",
      subtotal: 1850000,
      total: 1850000,
      ...buildOrderTaxSnapshot({
        totalAmount: 1850000,
        customerNpwp: makmurBersama.npwp
      }),
      paymentTermType: "IMMEDIATE",
      creditTermMonths: null,
      items: {
        create: [{ productId: getProductId("Seasonal Stock"), itemName: "Seasonal Stock", quantity: 1, baseUnitPrice: 1850000, finalUnitPrice: 1850000, subtotal: 1850000 }]
      }
    }
  });

  await Promise.all([
    prisma.salesOrder.create({
      data: {
        orderNumber: "SO-DEMO-MIX-001",
        customerId: nusantaraJaya.id,
        orderDate: getRollingDemoOrderDate(1),
        status: "Confirmed",
        subtotal: 1500000,
        total: 1500000,
        ...buildOrderTaxSnapshot({
          totalAmount: 1500000,
          customerNpwp: nusantaraJaya.npwp
        }),
        paymentTermType: "IMMEDIATE",
        creditTermMonths: null,
        notes: "Payment-behaviour demo: immediate-payment order.",
        items: {
          create: {
            productId: getProductId("Premium Material Set"),
            itemName: "Premium Material Set",
            quantity: 1,
            baseUnitPrice: 1500000,
            finalUnitPrice: 1500000,
            subtotal: 1500000
          }
        }
      }
    }),
    prisma.salesOrder.create({
      data: {
        orderNumber: "SO-DEMO-MIX-002",
        customerId: nusantaraJaya.id,
        orderDate: getRollingDemoOrderDate(2),
        status: "Confirmed",
        subtotal: 1800000,
        total: 1800000,
        ...buildOrderTaxSnapshot({
          totalAmount: 1800000,
          customerNpwp: nusantaraJaya.npwp
        }),
        paymentTermType: "CREDIT",
        creditTermMonths: 3,
        notes: "Payment-behaviour demo: long-term-credit order.",
        items: {
          create: {
            productId: getProductId("Delivery Service"),
            itemName: "Delivery Service",
            quantity: 1,
            baseUnitPrice: 1800000,
            finalUnitPrice: 1800000,
            subtotal: 1800000
          }
        }
      }
    })
  ]);

  const inv001 = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-001",
      salesOrderId: so001.id,
      customerId: sinarMaju.id,
      issueDate: new Date("2026-05-20"),
      dueDate: new Date("2026-05-20"),
      totalAmount: 5400000,
      customerNpwpSnapshot: so001.customerNpwpSnapshot,
      ppnApplied: so001.ppnApplied,
      ppnRateBasisPoints: so001.ppnRateBasisPoints,
      ppnAmount: so001.ppnAmount,
      netSalesAmount: so001.netSalesAmount,
      paidAmount: 5400000,
      remainingAmount: 0,
      paymentTermType: "IMMEDIATE",
      creditTermMonths: null,
      status: "Paid"
    }
  });

  const inv002 = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-002",
      salesOrderId: so003.id,
      customerId: tokoHarapan.id,
      issueDate: new Date("2026-05-28"),
      dueDate: new Date("2026-08-28"),
      totalAmount: 2750000,
      customerNpwpSnapshot: so003.customerNpwpSnapshot,
      ppnApplied: so003.ppnApplied,
      ppnRateBasisPoints: so003.ppnRateBasisPoints,
      ppnAmount: so003.ppnAmount,
      netSalesAmount: so003.netSalesAmount,
      paidAmount: 1000000,
      remainingAmount: 1750000,
      paymentTermType: "CREDIT",
      creditTermMonths: 3,
      status: "Partial"
    }
  });

  const inv003 = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-003",
      salesOrderId: so004.id,
      customerId: nusantaraJaya.id,
      issueDate: new Date("2026-04-18"),
      dueDate: new Date("2026-05-18"),
      totalAmount: 7900000,
      customerNpwpSnapshot: so004.customerNpwpSnapshot,
      ppnApplied: so004.ppnApplied,
      ppnRateBasisPoints: so004.ppnRateBasisPoints,
      ppnAmount: so004.ppnAmount,
      netSalesAmount: so004.netSalesAmount,
      paidAmount: 0,
      remainingAmount: 7900000,
      paymentTermType: "CREDIT",
      creditTermMonths: 1,
      status: "Overdue"
    }
  });

  await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-004",
      salesOrderId: so002.id,
      customerId: bintangNiaga.id,
      issueDate: new Date("2026-06-04"),
      dueDate: new Date("2026-07-04"),
      totalAmount: 3200000,
      customerNpwpSnapshot: so002.customerNpwpSnapshot,
      ppnApplied: so002.ppnApplied,
      ppnRateBasisPoints: so002.ppnRateBasisPoints,
      ppnAmount: so002.ppnAmount,
      netSalesAmount: so002.netSalesAmount,
      paidAmount: 0,
      remainingAmount: 3200000,
      paymentTermType: "CREDIT",
      creditTermMonths: 1,
      status: "Unpaid"
    }
  });

  const inv005 = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-005",
      salesOrderId: so005.id,
      customerId: makmurBersama.id,
      issueDate: new Date("2026-05-10"),
      dueDate: new Date("2026-05-10"),
      totalAmount: 1850000,
      customerNpwpSnapshot: so005.customerNpwpSnapshot,
      ppnApplied: so005.ppnApplied,
      ppnRateBasisPoints: so005.ppnRateBasisPoints,
      ppnAmount: so005.ppnAmount,
      netSalesAmount: so005.netSalesAmount,
      paidAmount: 0,
      remainingAmount: 1850000,
      paymentTermType: "IMMEDIATE",
      creditTermMonths: null,
      status: "Overdue"
    }
  });

  await prisma.payment.create({
    data: {
      invoiceId: inv001.id,
      paymentDate: new Date("2026-05-27"),
      amount: 5400000,
      paymentMethod: "BankTransfer",
      notes: "Full payment received."
    }
  });

  await prisma.payment.create({
    data: {
      invoiceId: inv002.id,
      paymentDate: new Date("2026-06-05"),
      amount: 1000000,
      paymentMethod: "Cash",
      notes: "Partial payment."
    }
  });

  await prisma.deliveryNote.create({
    data: {
      deliveryNoteNumber: "SJ-2026-001",
      invoiceId: inv001.id,
      salesOrderId: so001.id,
      customerId: sinarMaju.id,
      recipientName: sinarMaju.name,
      recipientPhone: sinarMaju.phone,
      recipientAddress: sinarMaju.address,
      deliveryDate: new Date("2026-05-28"),
      status: "Delivered",
      notes: "Delivery note generated after full payment.",
      receiverName: "Andi Saputra",
      senderName: "Admin CV Tajuk",
      driverName: DELIVERY_DRIVER_OPTIONS[0],
      vehiclePlateNumber: DELIVERY_VEHICLE_PLATE_OPTIONS[0],
      authorizedBy: "Admin Demo",
      items: {
        create: [
          {
            productCode: "PKG-A",
            itemName: "Product Package A",
            quantity: 3,
            unit: "PCS",
            description: "Delivered according to invoice INV-2026-001."
          },
          {
            productCode: "DLV-SVC",
            itemName: "Delivery Service",
            quantity: 1,
            unit: "PCS",
            description: "Local delivery service."
          }
        ]
      }
    }
  });

  await prisma.deliveryNote.create({
    data: {
      deliveryNoteNumber: "SJ-2026-002",
      invoiceId: inv002.id,
      salesOrderId: so003.id,
      customerId: tokoHarapan.id,
      recipientName: tokoHarapan.name,
      recipientPhone: tokoHarapan.phone,
      recipientAddress: tokoHarapan.address,
      deliveryDate: new Date("2026-06-06"),
      status: "Issued",
      notes: "Credit transaction. Delivery allowed before full payment for thesis demo flow.",
      receiverName: "Rizky Pratama",
      senderName: "Admin CV Tajuk",
      driverName: DELIVERY_DRIVER_OPTIONS[1],
      vehiclePlateNumber: DELIVERY_VEHICLE_PLATE_OPTIONS[1],
      authorizedBy: "Admin Demo",
      items: {
        create: [
          {
            productCode: "RST-PKG",
            itemName: "Retail Stock Package",
            quantity: 5,
            unit: "PCS",
            description: "Delivery based on partial payment invoice."
          }
        ]
      }
    }
  });

  await prisma.collectionTask.create({
    data: {
      customerId: nusantaraJaya.id,
      invoiceId: inv003.id,
      scheduledDate: new Date("2026-06-10"),
      status: "Planned",
      notes: "Call finance team about overdue invoice."
    }
  });

  await prisma.collectionTask.create({
    data: {
      customerId: tokoHarapan.id,
      invoiceId: inv002.id,
      scheduledDate: new Date("2026-06-12"),
      status: "Planned",
      notes: "Confirm remaining payment schedule."
    }
  });

  await prisma.collectionTask.create({
    data: {
      customerId: makmurBersama.id,
      invoiceId: inv005.id,
      scheduledDate: new Date("2026-06-04"),
      status: "Done",
      notes: "Customer promised payment next week."
    }
  });

  await prisma.auditTrail.createMany({
    data: [
      {
        actorUserId: adminUser.id,
        actorUsername: adminUser.username,
        actorDisplayName: adminUser.displayName,
        actorRole: "Admin",
        moduleName: "Sales Orders",
        entityType: "SALES_ORDER",
        entityId: so001.id,
        recordReference: so001.orderNumber,
        action: "CREATED",
        changeSummary: `Admin Demo created Sales Order ${so001.orderNumber}`,
        newValue: JSON.stringify({
          orderNumber: so001.orderNumber,
          status: so001.status,
          total: so001.total
        })
      },
      {
        actorUserId: salesUser.id,
        actorUsername: salesUser.username,
        actorDisplayName: salesUser.displayName,
        actorRole: "Sales",
        moduleName: "Customers",
        entityType: "CUSTOMER",
        entityId: sinarMaju.id,
        recordReference: sinarMaju.companyName,
        action: "UPDATED",
        changeSummary: "Sales Demo updated customer data for PT Sinar Maju",
        oldValue: JSON.stringify({ notes: "Existing demo customer" }),
        newValue: JSON.stringify({ notes: sinarMaju.notes })
      },
      {
        actorUserId: managerUser.id,
        actorUsername: managerUser.username,
        actorDisplayName: managerUser.displayName,
        actorRole: "Manager",
        moduleName: "Invoices",
        entityType: "INVOICE",
        entityId: inv003.id,
        recordReference: inv003.invoiceNumber,
        action: "STATUS_CHANGED",
        changeSummary: `Manager Demo reviewed invoice ${inv003.invoiceNumber} status`,
        oldValue: JSON.stringify({ status: "Unpaid" }),
        newValue: JSON.stringify({ status: inv003.status })
      }
    ]
  });

  await createGeneratedDemoData({
    adminUser,
    salesUser,
    managerUser,
    productIdByName
  });
  await verifySeedDemoData();
}

async function createGeneratedDemoData({
  adminUser,
  salesUser,
  managerUser,
  productIdByName
}: {
  adminUser: { id: string; username: string; displayName: string };
  salesUser: { id: string; username: string; displayName: string };
  managerUser: { id: string; username: string; displayName: string };
  productIdByName: Map<string, string>;
}) {
  const firstNames = [
    "Agus", "Ayu", "Bayu", "Citra", "Dimas", "Eka", "Farhan", "Gita", "Hendra", "Indah",
    "Joko", "Kartika", "Lukman", "Melati", "Nanda", "Oki", "Putri", "Rama", "Sari", "Teguh"
  ];
  const lastNames = ["Wijaya", "Permata", "Kusuma", "Utami", "Hidayat"];
  const companyPrefixes = ["PT", "CV", "UD", "Toko"];
  const companyWords = [
    "Abadi", "Bersama", "Cemerlang", "Damai", "Gemilang", "Indah", "Jaya", "Karya", "Lestari", "Makmur",
    "Mandiri", "Mitra", "Mulya", "Prima", "Sejahtera", "Sentosa", "Sukses", "Terang", "Utama", "Wijaya"
  ];
  const cities = ["Jakarta", "Bandung", "Surabaya", "Semarang", "Yogyakarta", "Malang", "Solo", "Bekasi"];
  const customerSegments = ["Retail", "Wholesale", "Corporate"];
  const productNames = [
    "Product Package A",
    "Wholesale Package",
    "Retail Stock Package",
    "Corporate Supply Package",
    "Seasonal Stock",
    "Premium Material Set",
    "Standard Material Set",
    "Custom Order Package",
    "Installation Service",
    "Delivery Service"
  ];
  const auditActors = [adminUser, salesUser, managerUser];
  const getProductId = (productName: string) => {
    const productId = productIdByName.get(productName);
    if (!productId) {
      throw new Error(`Generated seed product not found: ${productName}`);
    }
    return productId;
  };

  for (let index = 0; index < 100; index += 1) {
    const sequence = index + 6;
    const paddedSequence = String(sequence).padStart(3, "0");
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
    const companyName = `${companyPrefixes[index % companyPrefixes.length]} ${companyWords[index % companyWords.length]} ${companyWords[(index + 7) % companyWords.length]} ${String(index + 1).padStart(3, "0")}`;
    const city = cities[index % cities.length];
    const createdAt = new Date(2025, index % 12, (index % 25) + 1);
    const customer = await prisma.customer.create({
      data: {
        name: `${firstName} ${lastName}`,
        companyName,
        phone: `08${String(1200000000 + index).padStart(10, "0")}`,
        email: `customer${String(index + 1).padStart(3, "0")}@demo.example`,
        address: `Jl. Demo Revenue No. ${index + 1}, ${city}`,
        npwp:
          index % 4 === 0
            ? `9${String(index + 1).padStart(15, "0")}`
            : null,
        customerSegment: customerSegments[index % customerSegments.length],
        status: index % 15 === 0 ? "Inactive" : "Active",
        notes: `Generated demonstration customer ${index + 1} for table search, sorting, and filtering.`,
        createdAt
      }
    });

    const orderDate = getRollingDemoOrderDate(index);
    const isPendingApproval = index % 20 === 0;
    const isConfirmedOnly = !isPendingApproval && index % 17 === 0;
    const paymentTermType = index % 2 === 0 ? "CREDIT" as const : "IMMEDIATE" as const;
    const creditTermMonths = paymentTermType === "CREDIT" ? (index % 3) + 1 : null;
    const quantity = (index % 12) + 1;
    const finalUnitPrice = 250000 + (index % 8) * 125000;
    const secondQuantity = index % 3 === 0 ? 1 : 0;
    const secondUnitPrice = 150000;
    const total = quantity * finalUnitPrice + secondQuantity * secondUnitPrice;
    const primaryProductName = productNames[index % productNames.length];
    const salesOrder = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-2026-${paddedSequence}`,
        customerId: customer.id,
        orderDate,
        status: isPendingApproval ? "Draft" : isConfirmedOnly ? "Confirmed" : "Invoiced",
        subtotal: total,
        total,
        ...buildOrderTaxSnapshot({
          totalAmount: total,
          customerNpwp: customer.npwp
        }),
        paymentTermType,
        creditTermMonths,
        notes: `Generated Sales Order ${paddedSequence}`,
        approvalStatus: isPendingApproval ? "Pending" : "NotRequired",
        approvalRisk: isPendingApproval
          ? index % 40 === 0
            ? "Late Payment"
            : "Historically Late"
          : null,
        createdByUserId: salesUser.id,
        items: {
          create: [
            {
              productId: getProductId(primaryProductName),
              itemName: primaryProductName,
              quantity,
              baseUnitPrice: finalUnitPrice,
              finalUnitPrice,
              subtotal: quantity * finalUnitPrice
            },
            ...(secondQuantity > 0
              ? [{
                  productId: getProductId("Handling Fee"),
                  itemName: "Handling Fee",
                  quantity: secondQuantity,
                  baseUnitPrice: secondUnitPrice,
                  finalUnitPrice: secondUnitPrice,
                  subtotal: secondQuantity * secondUnitPrice
                }]
              : [])
          ]
        }
      }
    });

    if (!isPendingApproval && !isConfirmedOnly) {
      const issueDate = new Date(orderDate);
      const dueDate = new Date(issueDate);
      dueDate.setMonth(dueDate.getMonth() + (creditTermMonths ?? 0));
      let invoiceStatus: "Paid" | "Partial" | "Overdue" | "Unpaid";
      if (index % 4 === 0) invoiceStatus = "Paid";
      else if (index % 4 === 1) invoiceStatus = "Partial";
      else if (index % 4 === 2) invoiceStatus = "Overdue";
      else invoiceStatus = "Unpaid";
      const paidAmount =
        invoiceStatus === "Paid" ? total : invoiceStatus === "Partial" ? Math.floor(total / 2) : 0;
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-2026-${paddedSequence}`,
          salesOrderId: salesOrder.id,
          customerId: customer.id,
          issueDate,
          dueDate,
          totalAmount: total,
          customerNpwpSnapshot: salesOrder.customerNpwpSnapshot,
          ppnApplied: salesOrder.ppnApplied,
          ppnRateBasisPoints: salesOrder.ppnRateBasisPoints,
          ppnAmount: salesOrder.ppnAmount,
          netSalesAmount: salesOrder.netSalesAmount,
          paidAmount,
          remainingAmount: total - paidAmount,
          paymentTermType,
          creditTermMonths,
          status: invoiceStatus,
          notes: `Generated ${invoiceStatus.toLowerCase()} Invoice.`
        }
      });

      if (paidAmount > 0) {
        const paymentDate = new Date(dueDate);
        paymentDate.setDate(paymentDate.getDate() + (index % 8 === 0 ? 5 : -1));
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            paymentDate,
            amount: paidAmount,
            paymentMethod: index % 3 === 0 ? "Cash" : index % 3 === 1 ? "BankTransfer" : "Other",
            notes: invoiceStatus === "Paid" ? "Generated full payment." : "Generated partial payment."
          }
        });
      }

      if (invoiceStatus === "Paid" || (paymentTermType === "CREDIT" && index % 3 === 0)) {
        const deliveryDate = new Date(issueDate);
        deliveryDate.setDate(deliveryDate.getDate() + 7);
        await prisma.deliveryNote.create({
          data: {
            deliveryNoteNumber: `SJ-2026-${paddedSequence}`,
            invoiceId: invoice.id,
            salesOrderId: salesOrder.id,
            customerId: customer.id,
            recipientName: customer.name,
            recipientPhone: customer.phone,
            recipientAddress: customer.address,
            deliveryDate,
            status: index % 2 === 0 ? "Delivered" : "Issued",
            notes: "Generated delivery document.",
            receiverName: customer.name,
            senderName: "Admin CV Tajuk",
            driverName:
              DELIVERY_DRIVER_OPTIONS[index % DELIVERY_DRIVER_OPTIONS.length],
            vehiclePlateNumber:
              DELIVERY_VEHICLE_PLATE_OPTIONS[
                index % DELIVERY_VEHICLE_PLATE_OPTIONS.length
              ],
            authorizedBy: adminUser.displayName,
            items: {
              create: [{
                productCode: `DEMO-${paddedSequence}`,
                itemName: primaryProductName,
                quantity,
                unit: "PCS",
                description: "Generated delivery item."
              }]
            }
          }
        });
      }

      if (paymentTermType === "CREDIT" && invoiceStatus !== "Paid") {
        await prisma.collectionTask.create({
          data: {
            customerId: customer.id,
            invoiceId: invoice.id,
            scheduledDate: dueDate,
            status: index % 5 === 0 ? "Done" : "Planned",
            notes: `Generated collection task for INV-2026-${paddedSequence}.`
          }
        });
      }
    }

    if (index % 2 === 0) {
      const contactDate = new Date(2026, 4, (index % 28) + 1);
      await prisma.customerOutreach.create({
        data: {
          customerId: customer.id,
          contactDate,
          notes: `Generated product contact for ${companyName}.`
        }
      });
    }

    const actor = auditActors[index % auditActors.length];
    await prisma.auditTrail.create({
      data: {
        actorUserId: actor.id,
        actorUsername: actor.username,
        actorDisplayName: actor.displayName,
        actorRole: index % 3 === 0 ? "Admin" : index % 3 === 1 ? "Sales" : "Manager",
        moduleName: index % 2 === 0 ? "Customers" : "Sales Orders",
        entityType: index % 2 === 0 ? "CUSTOMER" : "SALES_ORDER",
        entityId: index % 2 === 0 ? customer.id : salesOrder.id,
        recordReference: index % 2 === 0 ? customer.companyName : salesOrder.orderNumber,
        action: index % 4 === 0 ? "CREATED" : index % 4 === 1 ? "UPDATED" : index % 4 === 2 ? "REVIEWED" : "STATUS_CHANGED",
        changeSummary: `Generated audit activity ${index + 1} for demonstration data.`,
        newValue: JSON.stringify({ generated: true, sequence: index + 1 })
      }
    });
  }
}

function getRollingDemoOrderDate(index: number, now = new Date()) {
  const orderDate = new Date(now);
  orderDate.setHours(12, 0, 0, 0);
  orderDate.setDate(
    Math.min((index % 20) + 1, Math.max(1, orderDate.getDate()))
  );
  orderDate.setMonth(orderDate.getMonth() - (index % 12));
  return orderDate;
}

async function verifySeedDemoData() {
  const [customers, products, orders, invoices, deliveryNotes] =
    await Promise.all([
      prisma.customer.findMany({
        select: {
          salesOrders: {
            select: {
              orderDate: true,
              status: true,
              paymentTermType: true,
              creditTermMonths: true
            }
          }
        }
      }),
      prisma.product.findMany({
        select: {
          id: true,
          salesOrderItems: {
            select: {
              productId: true,
              quantity: true,
              subtotal: true,
              salesOrder: {
                select: { orderDate: true, status: true }
              }
            }
          }
        }
      }),
      prisma.salesOrder.findMany({
        select: {
          id: true,
          total: true,
          customerNpwpSnapshot: true,
          ppnApplied: true,
          ppnRateBasisPoints: true,
          ppnAmount: true,
          netSalesAmount: true
        }
      }),
      prisma.invoice.findMany({
        select: {
          totalAmount: true,
          customerNpwpSnapshot: true,
          ppnApplied: true,
          ppnRateBasisPoints: true,
          ppnAmount: true,
          netSalesAmount: true,
          salesOrder: {
            select: {
              customerNpwpSnapshot: true,
              ppnApplied: true,
              ppnRateBasisPoints: true,
              ppnAmount: true,
              netSalesAmount: true
            }
          }
        }
      }),
      prisma.deliveryNote.findMany({
        select: { driverName: true, vehiclePlateNumber: true }
      })
    ]);

  const behaviours = new Set(
    customers.map(
      (customer) => getCustomerPaymentBehaviour(customer).behaviour
    )
  );
  for (const expectedBehaviour of [
    "Immediate Payment",
    "Short-Term Credit",
    "Long-Term Credit",
    "Mixed",
    "No Payment History"
  ] as const) {
    assertSeed(
      behaviours.has(expectedBehaviour),
      `Missing payment-behaviour demo: ${expectedBehaviour}`
    );
  }

  assertSeed(
    products.some(
      (product) =>
        getCurrentMonthAverageSoldPrice(
          product.id,
          product.salesOrderItems
        ).averageSoldPrice !== null
    ),
    "No product has an eligible current-month average sold price"
  );

  assertSeed(
    orders.some((order) => order.ppnApplied) &&
      orders.some((order) => !order.ppnApplied),
    "Taxed and non-taxed order demos are both required"
  );
  for (const order of orders) {
    assertSeed(
      order.netSalesAmount + order.ppnAmount === order.total,
      `Order ${order.id} does not reconcile Net Sales + PPN = Total`
    );
    assertSeed(
      order.ppnApplied === (order.customerNpwpSnapshot !== null),
      `Order ${order.id} has an inconsistent NPWP/PPN snapshot`
    );
  }

  for (const invoice of invoices) {
    assertSeed(
      invoice.netSalesAmount + invoice.ppnAmount === invoice.totalAmount,
      "An invoice does not reconcile Net Sales + PPN = Total"
    );
    assertSeed(
      invoice.customerNpwpSnapshot ===
        invoice.salesOrder.customerNpwpSnapshot &&
        invoice.ppnApplied === invoice.salesOrder.ppnApplied &&
        invoice.ppnRateBasisPoints ===
          invoice.salesOrder.ppnRateBasisPoints &&
        invoice.ppnAmount === invoice.salesOrder.ppnAmount &&
        invoice.netSalesAmount === invoice.salesOrder.netSalesAmount,
      "An invoice tax snapshot differs from its Sales Order"
    );
  }

  const allowedDrivers = new Set<string>(DELIVERY_DRIVER_OPTIONS);
  const allowedVehiclePlates = new Set<string>(
    DELIVERY_VEHICLE_PLATE_OPTIONS
  );
  for (const deliveryNote of deliveryNotes) {
    assertSeed(
      allowedDrivers.has(deliveryNote.driverName ?? "") &&
        allowedVehiclePlates.has(deliveryNote.vehiclePlateNumber ?? ""),
      "A seeded Surat Jalan has a missing or invalid delivery assignment"
    );
  }

  console.log(
    `Verified demo intelligence: ${behaviours.size} payment behaviours, ` +
      `${orders.filter((order) => order.ppnApplied).length} taxed orders, ` +
      `${deliveryNotes.length} assigned Surat Jalan records.`
  );
}

function assertSeed(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Seed verification failed: ${message}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
