import { memberShipType } from '../enums/role.enum.js';

export interface CirculationPolicy {
  loanDays: Record<memberShipType, number>;
  maxActiveLoans: Record<memberShipType, number>;
  maxRenewals: number;
  renewDays: number;
  finePerDay: number;
  maxFinePerBook: number;
  unpaidFineBorrowLimit: number;
  reservationHoldHours: number;
  damagedCharge: number;
  lostCharge: number;
}

export const circulationPolicy: CirculationPolicy = {
  loanDays: {
    [memberShipType.STUDENT]: 14,
    [memberShipType.FACULTY]: 30,
    [memberShipType.PUBLIC]: 14,
  },
  maxActiveLoans: {
    [memberShipType.STUDENT]: 5,
    [memberShipType.FACULTY]: 10,
    [memberShipType.PUBLIC]: 3,
  },
  maxRenewals: 2,
  renewDays: 7,
  finePerDay: 500,
  maxFinePerBook: 50000,
  unpaidFineBorrowLimit: 50000,
  reservationHoldHours: 48,
  damagedCharge: 10000,
  lostCharge: 50000,
};
