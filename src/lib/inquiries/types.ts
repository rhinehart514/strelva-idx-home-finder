export type InquiryInput = {
  listing: {
    id: string;
    address: string;
  };
  buyer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  message?: string;
  criteria?: string;
  consent: true;
  agency: {
    id: string;
    name: string;
  };
  /** A visually hidden field. Real buyers should always leave it empty. */
  website?: string;
};

export type InquiryDeliveryStatus =
  | "delivered"
  | "pending"
  | "preview"
  | "unavailable";

export type InquiryResult = {
  status: InquiryDeliveryStatus;
  message: string;
  requestId: string;
};

export type InquiryValidationIssue = {
  field: string;
  message: string;
};
