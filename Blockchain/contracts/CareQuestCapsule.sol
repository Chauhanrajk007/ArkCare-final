// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CareQuestCapsule is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error TransfersDisabled();

    constructor(address admin) ERC20("CareQuest Capsule", "CAP") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address patientWallet, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        _mint(patientWallet, amount);
    }

    function correctionBurn(address patientWallet, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        _burn(patientWallet, amount);
    }

    // CAP is intentionally non-transferable. Mint and correction burn are the
    // only balance movements. This prevents a patient participation unit from
    // becoming a freely traded healthcare token in the pilot.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }
        super._update(from, to, value);
    }
}
