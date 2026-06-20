export const customers = [
  {
    id: "cust-001",
    name: "Andi Saputra",
    companyName: "PT Sinar Maju",
    phone: "0812-1000-1100",
    email: "andi@sinarmaju.example",
    address: "Jl. Merdeka No. 12, Bandung",
    customerType: "Retail",
    status: "Active",
    notes: "Long-term customer with regular monthly orders."
  },
  {
    id: "cust-002",
    name: "Maya Lestari",
    companyName: "CV Bintang Niaga",
    phone: "0813-2000-2200",
    email: "maya@bintangniaga.example",
    address: "Jl. Cendana No. 7, Jakarta",
    customerType: "Wholesale",
    status: "Active",
    notes: "Usually pays by bank transfer."
  },
  {
    id: "cust-003",
    name: "Rizky Pratama",
    companyName: "Toko Harapan",
    phone: "0815-3000-3300",
    email: "rizky@tokoharapan.example",
    address: "Jl. Diponegoro No. 21, Semarang",
    customerType: "Retail",
    status: "Active",
    notes: "Needs reminder before due date."
  },
  {
    id: "cust-004",
    name: "Dewi Anggraeni",
    companyName: "PT Nusantara Jaya",
    phone: "0817-4000-4400",
    email: "dewi@nusantarajaya.example",
    address: "Jl. Veteran No. 9, Surabaya",
    customerType: "Corporate",
    status: "Active",
    notes: "Requests formal invoice copies."
  },
  {
    id: "cust-005",
    name: "Budi Santoso",
    companyName: "UD Makmur Bersama",
    phone: "0819-5000-5500",
    email: "budi@makmurbersama.example",
    address: "Jl. Sudirman No. 31, Yogyakarta",
    customerType: "Wholesale",
    status: "Inactive",
    notes: "Inactive until next seasonal order."
  }
];

export const salesOrders = [
  {
    id: "so-001",
    orderNumber: "SO-2026-001",
    customerId: "cust-001",
    customerName: "PT Sinar Maju",
    orderDate: "2026-05-20",
    status: "Invoiced",
    total: 5400000
  },
  {
    id: "so-002",
    orderNumber: "SO-2026-002",
    customerId: "cust-002",
    customerName: "CV Bintang Niaga",
    orderDate: "2026-05-24",
    status: "Confirmed",
    total: 3200000
  },
  {
    id: "so-003",
    orderNumber: "SO-2026-003",
    customerId: "cust-003",
    customerName: "Toko Harapan",
    orderDate: "2026-05-28",
    status: "Invoiced",
    total: 2750000
  },
  {
    id: "so-004",
    orderNumber: "SO-2026-004",
    customerId: "cust-004",
    customerName: "PT Nusantara Jaya",
    orderDate: "2026-06-01",
    status: "Shipped",
    total: 7900000
  },
  {
    id: "so-005",
    orderNumber: "SO-2026-005",
    customerId: "cust-005",
    customerName: "UD Makmur Bersama",
    orderDate: "2026-06-03",
    status: "Draft",
    total: 1850000
  }
];

export const invoices = [
  {
    id: "inv-001",
    invoiceNumber: "INV-2026-001",
    salesOrderId: "so-001",
    customerId: "cust-001",
    customerName: "PT Sinar Maju",
    issueDate: "2026-05-20",
    dueDate: "2026-06-03",
    totalAmount: 5400000,
    paidAmount: 5400000,
    remainingAmount: 0,
    status: "Paid"
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-2026-002",
    salesOrderId: "so-003",
    customerId: "cust-003",
    customerName: "Toko Harapan",
    issueDate: "2026-05-28",
    dueDate: "2026-06-11",
    totalAmount: 2750000,
    paidAmount: 1000000,
    remainingAmount: 1750000,
    status: "Partial"
  },
  {
    id: "inv-003",
    invoiceNumber: "INV-2026-003",
    salesOrderId: "so-004",
    customerId: "cust-004",
    customerName: "PT Nusantara Jaya",
    issueDate: "2026-05-18",
    dueDate: "2026-06-01",
    totalAmount: 7900000,
    paidAmount: 0,
    remainingAmount: 7900000,
    status: "Overdue"
  },
  {
    id: "inv-004",
    invoiceNumber: "INV-2026-004",
    salesOrderId: "so-002",
    customerId: "cust-002",
    customerName: "CV Bintang Niaga",
    issueDate: "2026-06-04",
    dueDate: "2026-06-18",
    totalAmount: 3200000,
    paidAmount: 0,
    remainingAmount: 3200000,
    status: "Unpaid"
  },
  {
    id: "inv-005",
    invoiceNumber: "INV-2026-005",
    salesOrderId: "so-005",
    customerId: "cust-005",
    customerName: "UD Makmur Bersama",
    issueDate: "2026-05-10",
    dueDate: "2026-05-24",
    totalAmount: 1850000,
    paidAmount: 850000,
    remainingAmount: 1000000,
    status: "Overdue"
  }
];

export const payments = [
  {
    id: "pay-001",
    invoiceNumber: "INV-2026-001",
    customerName: "PT Sinar Maju",
    paymentDate: "2026-05-27",
    amount: 5400000,
    paymentMethod: "Bank Transfer",
    notes: "Full payment received."
  },
  {
    id: "pay-002",
    invoiceNumber: "INV-2026-002",
    customerName: "Toko Harapan",
    paymentDate: "2026-06-05",
    amount: 1000000,
    paymentMethod: "Cash",
    notes: "Partial payment."
  },
  {
    id: "pay-003",
    invoiceNumber: "INV-2026-005",
    customerName: "UD Makmur Bersama",
    paymentDate: "2026-05-17",
    amount: 850000,
    paymentMethod: "Bank Transfer",
    notes: "First installment."
  }
];

export const followUps = [
  {
    id: "fu-001",
    customerName: "PT Nusantara Jaya",
    invoiceNumber: "INV-2026-003",
    followUpDate: "2026-06-10",
    status: "Planned",
    notes: "Call finance team about overdue invoice."
  },
  {
    id: "fu-002",
    customerName: "Toko Harapan",
    invoiceNumber: "INV-2026-002",
    followUpDate: "2026-06-12",
    status: "Planned",
    notes: "Confirm remaining payment schedule."
  },
  {
    id: "fu-003",
    customerName: "UD Makmur Bersama",
    invoiceNumber: "INV-2026-005",
    followUpDate: "2026-06-04",
    status: "Done",
    notes: "Customer promised payment next week."
  }
];

export const testingEvidence = [
  {
    testType: "Unit Testing",
    scenarioId: "UT-AUTH-001",
    scenarioName: "Verify password hash",
    userRole: "System",
    steps: "Compare entered password with stored password hash.",
    expectedResult: "Correct password is accepted and incorrect password is rejected.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-001",
    scenarioName: "Calculate sales order total",
    userRole: "System",
    steps: "Input order items with quantity and unit price.",
    expectedResult: "Subtotal and total are calculated correctly.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-002",
    scenarioName: "Calculate remaining invoice amount",
    userRole: "System",
    steps: "Input invoice total and paid amount.",
    expectedResult: "Remaining amount equals total amount minus paid amount.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-003",
    scenarioName: "Calculate partial payment status",
    userRole: "System",
    steps: "Input paid amount greater than zero but less than invoice total.",
    expectedResult: "Invoice status becomes Partial.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-004",
    scenarioName: "Calculate overdue status",
    userRole: "System",
    steps: "Input invoice with past due date and remaining balance.",
    expectedResult: "Invoice status becomes Overdue.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-005",
    scenarioName: "Build invoice draft from sales order",
    userRole: "System",
    steps: "Input sales order ID, customer ID, total amount, and issue date.",
    expectedResult:
      "Invoice draft uses sales order data, starts Unpaid, and due date is 14 days after issue date.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-006",
    scenarioName: "Derive active receivables",
    userRole: "System",
    steps: "Input invoice status and remaining amount.",
    expectedResult:
      "Unpaid, Partial, and Overdue invoices with remaining balance appear as active receivables; Paid invoices are excluded.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-007",
    scenarioName: "Validate sales order payment term",
    userRole: "System",
    steps: "Input Debit, valid Credit, and invalid Credit terms.",
    expectedResult: "Debit is accepted without credit term and Credit requires 1-12 months.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-008",
    scenarioName: "Calculate Debit and Credit due dates",
    userRole: "System",
    steps: "Input Debit and Credit invoice issue dates.",
    expectedResult:
      "Debit due date equals issue date and Credit due date adds selected months.",
    status: "Prepared"
  },
  {
    testType: "Unit Testing",
    scenarioId: "UT-009",
    scenarioName: "Check Surat Jalan payment-term rule",
    userRole: "System",
    steps: "Input Debit unpaid, Debit paid, and Credit unpaid invoice states.",
    expectedResult:
      "Debit unpaid blocks Surat Jalan while Debit paid and Credit unpaid allow Surat Jalan.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-AUTH-001",
    scenarioName: "Successful login to dashboard",
    userRole: "Admin",
    steps: "Open app, enter active username and password, then submit.",
    expectedResult: "User is redirected to Dashboard.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-AUTH-002",
    scenarioName: "Failed login",
    userRole: "Admin",
    steps: "Open Login and enter wrong username or password.",
    expectedResult: "System shows a simple error message.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-AUTH-003",
    scenarioName: "Logout redirects to login",
    userRole: "Admin",
    steps: "Select Logout from the sidebar.",
    expectedResult: "Session is cleared and Login page opens.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-AUTH-004",
    scenarioName: "Inactive account cannot log in",
    userRole: "Admin",
    steps: "Create inactive account, then try to log in.",
    expectedResult: "Login is rejected with an error message.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-001",
    scenarioName: "Customer to sales order",
    userRole: "Admin",
    steps: "Create customer, then create sales order for that customer.",
    expectedResult: "Sales order is linked to the selected customer.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-002",
    scenarioName: "Sales order to invoice",
    userRole: "Admin",
    steps: "Create sales order, choose Debit or Credit, and select Confirm & Generate Invoice.",
    expectedResult:
      "One invoice is created, payment term is copied, due date is calculated, and sales order status becomes Invoiced.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-003",
    scenarioName: "Invoice to payment",
    userRole: "Admin",
    steps: "Select Record Payment from the payment queue and save a partial payment.",
    expectedResult: "Paid amount, remaining amount, and invoice status update correctly.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-INV-PRINT-01",
    scenarioName: "Invoice detail to printable invoice",
    userRole: "Admin",
    steps: "Open invoice detail, then select View / Print Invoice.",
    expectedResult:
      "Printable invoice shows customer data, sales order items, totals, payment status, and signature area.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-SJ-001",
    scenarioName: "Invoice to Surat Jalan",
    userRole: "Admin",
    steps: "Open invoice detail, select Create Surat Jalan, review copied customer and item data, then save.",
    expectedResult: "Surat Jalan is created and linked to invoice or sales order data.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-SJ-002",
    scenarioName: "Printable Surat Jalan",
    userRole: "Admin",
    steps: "Open Surat Jalan detail, then select View / Print.",
    expectedResult:
      "Printable Surat Jalan shows recipient data, item table, attention notes, and signature lines.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-SJ-TERM-001",
    scenarioName: "Debit Surat Jalan rule",
    userRole: "Admin",
    steps: "Try creating Surat Jalan from unpaid Debit invoice, then after full payment.",
    expectedResult: "Surat Jalan is blocked before payment and allowed after invoice is Paid.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-SJ-TERM-002",
    scenarioName: "Credit Surat Jalan rule",
    userRole: "Admin",
    steps: "Create Surat Jalan from unpaid Credit invoice.",
    expectedResult: "Surat Jalan is allowed from Credit invoice before full payment.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-004",
    scenarioName: "Invoice to receivable status",
    userRole: "Admin",
    steps: "Open Receivables after recording payment.",
    expectedResult: "Invoice appears only when remaining amount is more than zero.",
    status: "Prepared"
  },
  {
    testType: "Integration Testing / SIT",
    scenarioId: "SIT-005",
    scenarioName: "Receivable to billing",
    userRole: "Sales",
    steps: "Select Create Billing from a receivable row.",
    expectedResult:
      "Billing form opens with customer and invoice context, then appears in the list and dashboard reminder.",
    status: "Prepared"
  },
  {
    testType: "System Acceptance Testing / SAT",
    scenarioId: "SAT-001",
    scenarioName: "Access all modules",
    userRole: "Manager",
    steps: "Open each navigation module.",
    expectedResult: "All pages load successfully.",
    status: "Prepared"
  },
  {
    testType: "System Acceptance Testing / SAT",
    scenarioId: "SAT-002",
    scenarioName: "Dashboard reflects data",
    userRole: "Manager",
    steps: "Create order, invoice, payment, and billing activity, then reopen Dashboard.",
    expectedResult: "Dashboard totals, recent orders, receivables, and reminders update.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-AUTH-001",
    scenarioName: "Admin logs in",
    userRole: "Admin",
    steps: "Open Login and enter default Admin username and password.",
    expectedResult: "Dashboard opens after successful login.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-AUTH-002",
    scenarioName: "Admin adds account from Settings",
    userRole: "Admin",
    steps: "Open Settings, enter username, display name, password, role, and status, then save.",
    expectedResult: "New account appears in Existing Accounts without showing password hash.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-AUTH-003",
    scenarioName: "Inactive account is rejected",
    userRole: "Admin",
    steps: "Create inactive account, log out, then try logging in with that account.",
    expectedResult: "Inactive account cannot access the system.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-001",
    scenarioName: "Admin records customer",
    userRole: "Admin",
    steps: "Open Customers, add customer, view detail, and edit customer.",
    expectedResult: "Customer data is saved and can be selected for sales order.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-002",
    scenarioName: "Sales creates sales order and invoice",
    userRole: "Sales",
    steps:
      "Open Sales Orders, select customer, add items, choose Debit or Credit term, and select Confirm & Generate Invoice.",
    expectedResult:
      "Sales order appears with correct total and invoice is created automatically with correct due date.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-003",
    scenarioName: "Admin reviews generated invoice",
    userRole: "Admin",
    steps: "Open Invoices after sales order confirmation.",
    expectedResult:
      "Invoice shows copied customer, sales order, item, amount, payment term, and due date data.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-TERM-001",
    scenarioName: "Debit requires payment before Surat Jalan",
    userRole: "Admin",
    steps:
      "Create Debit sales order and invoice, try Surat Jalan before payment, record full payment, then create Surat Jalan.",
    expectedResult: "Surat Jalan is blocked before payment and allowed after invoice is Paid.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-TERM-002",
    scenarioName: "Credit allows Surat Jalan before payment",
    userRole: "Admin",
    steps:
      "Create Credit 3-month sales order and invoice, then create Surat Jalan before recording payment.",
    expectedResult:
      "Surat Jalan can be created and invoice appears as active receivable until paid.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-004",
    scenarioName: "Admin records payment from queue",
    userRole: "Admin",
    steps: "Open Payments, select Record Payment from invoice row, and save partial payment.",
    expectedResult: "Invoice becomes Partial and remaining amount decreases.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-SJ-001",
    scenarioName: "Admin creates Surat Jalan from invoice",
    userRole: "Admin",
    steps: "Open invoice detail, select Create Surat Jalan, review copied data, and save.",
    expectedResult: "Surat Jalan is created and linked to invoice or sales order data.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-SJ-002",
    scenarioName: "Admin creates Surat Jalan manually",
    userRole: "Admin",
    steps: "Open Surat Jalan, add a new record, select customer, enter items, and save.",
    expectedResult: "Manual Surat Jalan appears in the list.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-SJ-003",
    scenarioName: "Admin prints Surat Jalan",
    userRole: "Admin",
    steps: "Open Surat Jalan detail and select View / Print.",
    expectedResult: "Printable Surat Jalan opens with recipient, items, notes, and signatures.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-INV-PRINT-01",
    scenarioName: "Admin views and prints invoice document",
    userRole: "Admin",
    steps: "Open Invoices, view invoice detail, and select View / Print Invoice.",
    expectedResult:
      "System displays printable invoice with customer data, invoice items, total amount, payment status, and signature area.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-005",
    scenarioName: "Admin checks receivables",
    userRole: "Admin",
    steps: "Open Receivables after recording payment and select Create Billing from a receivable row.",
    expectedResult:
      "Open invoice balance is visible, paid invoices are hidden, and billing starts with customer and invoice preselected.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-006",
    scenarioName: "Sales creates billing reminder",
    userRole: "Sales",
    steps: "Create planned billing reminder for customer or invoice.",
    expectedResult: "Billing activity appears on the Billing page and Dashboard.",
    status: "Prepared"
  },
  {
    testType: "User Acceptance Testing / UAT",
    scenarioId: "UAT-007",
    scenarioName: "Manager reviews dashboard",
    userRole: "Manager",
    steps: "Open dashboard and receivables.",
    expectedResult: "Revenue cycle summary and overdue receivables are visible.",
    status: "Prepared"
  }
];
