// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CareQuestHospitalCapsules is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error TransfersDisabled();
    error InvalidTokenId();

    constructor(address admin) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mint(
        address patientWallet,
        uint256 tokenId,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) {
        if (tokenId == 0) revert InvalidTokenId();
        _mint(patientWallet, tokenId, amount, "");
    }

    function correctionBurn(
        address patientWallet,
        uint256 tokenId,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) {
        if (tokenId == 0) revert InvalidTokenId();
        _burn(patientWallet, tokenId, amount);
    }

    // Hospital Capsules are closed-loop participation units in the demo.
    // Mint and authorized correction burn are the only balance movements.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        if (from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }
        super._update(from, to, ids, values);
    }
}
