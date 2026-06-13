// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Soulbound ERC-721 test double for QIEPass. Testnet only.
///         Transfer and approval are permanently disabled.
contract MockQIEPass is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("Mock QIE Pass", "QIEPASS") {}

    function mint(address to) external onlyOwner {
        _safeMint(to, _nextTokenId++);
    }

    // ---- Soulbound: block all transfers ----

    function transferFrom(address, address, uint256) public pure override {
        revert("QIEPass: soulbound");
    }

    function safeTransferFrom(address, address, uint256, bytes memory)
        public pure override
    {
        revert("QIEPass: soulbound");
    }

    function approve(address, uint256) public pure override {
        revert("QIEPass: soulbound");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("QIEPass: soulbound");
    }
}
