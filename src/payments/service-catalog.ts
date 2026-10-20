// Service prices (₹), generated from the frontend's src/components/services/serviceData.jsx.
// Keep in sync when prices change: the server charges these, whatever the page shows.

export interface ServiceEntry {
  title: string;
  professional_fee?: number;
  packages: Record<string, number>;
}

export const SERVICE_CATALOG: Record<string, ServiceEntry> = {
  "gst-registration": {
    "title": "GST Registration",
    "professional_fee": 999,
    "packages": {
      "Basic": 999,
      "Standard": 2799,
      "Premium": 4999,
      "Annual": 7999
    }
  },
  "gst-return-filing": {
    "title": "GST Return Filing",
    "professional_fee": 799,
    "packages": {
      "Nil Return": 399,
      "Regular": 799,
      "Quarterly": 1499
    }
  },
  "gst-modification": {
    "title": "GST Modification",
    "professional_fee": 1499,
    "packages": {
      "Core Details": 1499,
      "Advanced": 2499
    }
  },
  "gstr-9-filing": {
    "title": "GSTR-9 Annual Return Filing",
    "professional_fee": 2999,
    "packages": {
      "Standard": 2999,
      "With Audit": 5999
    }
  },
  "trademark-registration": {
    "title": "Trademark Registration",
    "professional_fee": 1999,
    "packages": {
      "Basic": 1999,
      "Standard": 4999,
      "Premium": 11999,
      "All In One": 14999
    }
  },
  "trademark-renewal": {
    "title": "Trademark Renewal",
    "professional_fee": 4999,
    "packages": {
      "Standard Renewal": 4999,
      "Restoration + Renewal": 7999
    }
  },
  "trademark-objection": {
    "title": "Trademark Objection Reply",
    "professional_fee": 3999,
    "packages": {
      "Objection Reply": 3999,
      "Reply + Hearing": 6999
    }
  },
  "private-limited-company": {
    "title": "Private Limited Company Registration",
    "professional_fee": 7499,
    "packages": {
      "Basic": 7499,
      "Standard": 9999,
      "Premium": 14999
    }
  },
  "llp-registration": {
    "title": "LLP Registration",
    "professional_fee": 5999,
    "packages": {
      "Standard": 5999,
      "Complete": 8499
    }
  },
  "section-8-company": {
    "title": "Section 8 Company Registration",
    "professional_fee": 8999,
    "packages": {
      "Standard": 8999,
      "Complete": 14999
    }
  },
  "fssai-registration": {
    "title": "FSSAI / FoSCoS Food License",
    "professional_fee": 1999,
    "packages": {
      "Basic (1 Year)": 1999,
      "Basic (5 Years)": 3999,
      "State License": 3499,
      "Central License": 4499
    }
  },
  "iec-registration": {
    "title": "Import Export Code (IEC) Registration",
    "professional_fee": 3499,
    "packages": {
      "IEC Registration": 3499,
      "IEC + GST": 4499
    }
  },
  "bis-certification": {
    "title": "BIS Certification",
    "professional_fee": 12999,
    "packages": {
      "ISI Mark": 12999,
      "CRS Registration": 14999
    }
  },
  "dpt-3-filing": {
    "title": "DPT-3 Filing",
    "professional_fee": 2499,
    "packages": {
      "DPT-3 Filing": 2499
    }
  },
  "project-report": {
    "title": "Project Report Preparation",
    "professional_fee": 3999,
    "packages": {
      "Basic": 3999,
      "Detailed": 6999
    }
  }
};
