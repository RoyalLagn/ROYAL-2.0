import type {
  NewNotification,
  NotificationType,
} from "@/context/NotificationContext";

const mockNotification = (
  type: NotificationType,
  title: string,
  message: string,
  overrides: Partial<NewNotification> = {}
): NewNotification => ({
  type,
  title,
  message,
  ...overrides,
});

export const createVendorApprovalNotification = (
  overrides?: Partial<NewNotification>
) => mockNotification(
  "vendor_approval",
  "Vendor application approved",
  "Your Vendor profile has been approved and is ready to publish.",
  overrides
);

export const createBookingConfirmedNotification = (
  overrides?: Partial<NewNotification>
) => mockNotification(
  "booking_confirmed",
  "Booking confirmed",
  "Your wedding service booking has been confirmed.",
  overrides
);

export const createBookingCancelledNotification = (
  overrides?: Partial<NewNotification>
) => mockNotification(
  "booking_cancelled",
  "Booking cancelled",
  "A booking was cancelled. Open the booking details for more information.",
  overrides
);

export const createOfferNotification = (
  overrides?: Partial<NewNotification>
) => mockNotification(
  "new_offer",
  "New offer available",
  "A new RoyalLagn offer is available for your wedding plans.",
  overrides
);

export const createAdminAnnouncementNotification = (
  overrides?: Partial<NewNotification>
) => mockNotification(
  "admin_announcement",
  "RoyalLagn announcement",
  "There is a new platform announcement from the RoyalLagn team.",
  overrides
);

export const createProfileUpdatedNotification = (
  overrides?: Partial<NewNotification>
) => mockNotification(
  "profile_updated",
  "Profile updated",
  "Your profile information was updated successfully.",
  overrides
);

export const createPaymentReminderNotification = (
  overrides?: Partial<NewNotification>
) => mockNotification(
  "payment_reminder",
  "Payment reminder",
  "A payment is coming due. Review the details when convenient.",
  overrides
);

export const createNotificationMockSet = (): NewNotification[] => [
  createVendorApprovalNotification(),
  createBookingConfirmedNotification(),
  createBookingCancelledNotification(),
  createOfferNotification(),
  createAdminAnnouncementNotification(),
  createProfileUpdatedNotification(),
  createPaymentReminderNotification(),
];
