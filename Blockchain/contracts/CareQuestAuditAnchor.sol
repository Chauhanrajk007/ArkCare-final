// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CareQuestAuditAnchor is AccessControl {
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    mapping(bytes32 => bytes32) public roots;

    event AuditAnchored(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        uint64 anchoredAt
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ANCHOR_ROLE, admin);
    }

    function anchor(bytes32 batchId, bytes32 merkleRoot)
        external
        onlyRole(ANCHOR_ROLE)
    {
        require(roots[batchId] == bytes32(0), "batch already anchored");
        require(merkleRoot != bytes32(0), "empty root");
        roots[batchId] = merkleRoot;
        emit AuditAnchored(batchId, merkleRoot, uint64(block.timestamp));
    }
}
