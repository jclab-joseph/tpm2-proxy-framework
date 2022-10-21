export type TPM2_ST_TYPE = number;
export const TPM2_ST_SIZE = 2;
export enum TPM2_ST_ENUM {
  TPM2_ST_RSP_COMMAND = 0x00C4, /* Tag value for a response used when there is an error in the tag. This is also the value returned from a TPM 1.2 when an error occurs. This value is used in this specification because an error in the command tag may prevent determination of the family. When this tag is used in the response the response code will be TPM2_RC_BAD_TAG 0 1E16 which has the same numeric value as the TPM 1.2 response code for TPM_BADTAG. NOTE In a previously published version of this specification TPM2_RC_BAD_TAG was incorrectly assigned a value of 0x030 instead of 30 0x01e. Some implementations my return the old value instead of the new value. */
  TPM2_ST_NULL = 0X8000, /* no structure type specified */
  TPM2_ST_NO_SESSIONS = 0x8001, /* tag value for a command response for a command defined in this specification indicating that the command response has no attached sessions and no authorizationSizeparameterSize value is present. If the responseCode from the TPM is not TPM2_RC_SUCCESS then the response tag shall have this value. */
  TPM2_ST_SESSIONS = 0x8002, /* tag value for a command response for a command defined in this specification indicating that the command response has one or more attached sessions and the authorizationSizeparameterSize field is present */
  TPM2_ST_RESERVED1 = 0x8003, /* When used between application software and the TPM resource manager, this tag indicates that the command has no sessions and the handles are using the Name format rather than the 32-bit handle format. NOTE 1 The response to application software will have a tag of TPM2_ST_NO_SESSIONS. Between the TRM and TPM, this tag would occur in a response from a TPM that overlaps the tag parameter of a request with the tag parameter of a response when the response has no associated sessions. NOTE 2 This tag is not used by all TPM or TRM implementations. */
  TPM2_ST_RESERVED2 = 0x8004, /* When used between application software and the TPM resource manager. This tag indicates that the command has sessions and the handles are using the Name format rather than the 32-bit handle format. NOTE 1 If the command completes successfully the response to application software will have a tag of TPM2_ST_SESSIONS. Between the TRM and TPM would occur in a response from a TPM that overlaps the tag parameter of a request with the tag parameter of a response when the response has authorization sessions. NOTE 2 This tag is not used by all TPM or TRM implementations. */
  TPM2_ST_ATTEST_NV = 0x8014, /* tag for an attestation structure */
  TPM2_ST_ATTEST_COMMAND_AUDIT = 0x8015, /* tag for an attestation structure */
  TPM2_ST_ATTEST_SESSION_AUDIT = 0x8016, /* tag for an attestation structure */
  TPM2_ST_ATTEST_CERTIFY = 0x8017, /* tag for an attestation structure */
  TPM2_ST_ATTEST_QUOTE = 0x8018, /* tag for an attestation structure */
  TPM2_ST_ATTEST_TIME = 0x8019, /* tag for an attestation structure */
  TPM2_ST_ATTEST_CREATION = 0x801A, /* tag for an attestation structure */
  TPM2_ST_RESERVED3 = 0x801B, /* do not use . NOTE This was previously assigned to TPM2_ST_ATTEST_NV. The tag is changed because the structure has changed */
  TPM2_ST_CREATION = 0x8021, /* tag for a ticket type */
  TPM2_ST_VERIFIED = 0x8022, /* tag for a ticket type */
  TPM2_ST_AUTH_SECRET = 0x8023, /* tag for a ticket type */
  TPM2_ST_HASHCHECK = 0x8024, /* tag for a ticket type */
  TPM2_ST_AUTH_SIGNED = 0x8025, /* tag for a ticket type */
  TPM2_ST_FU_MANIFEST = 0x8029, /* tag for a structure describing a Field Upgrade Policy */
}
