const { ethers, getNamedAccounts } = require("hardhat");
const { expect, assert } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DecentraAid", () => {
  let decentraAid, deployer, fakeDeployer, signer;
  let daysGracePeriod = 5;

  //Organization variables
  let orgName = "organization";
  let orgDescription = ethers.encodeBytes32String("organizationDescription");

  let organizationData = [orgName, orgDescription];

  let orgId = ethers.solidityPackedKeccak256(
    ["string", "bytes32"],
    [...organizationData]
  );

  //Campaign variables
  let campaignName = "campaign";
  let campaignDescription = ethers.encodeBytes32String("campaignDescription");
  let campaignTargetAmount = ethers.parseEther("10");

  let date = new Date();
  let daysForCampaign = 5;
  date.setDate(date.getDate() + daysForCampaign);
  let campaignTimeline = date.getTime();

  let campaignData = [
    campaignName,
    campaignDescription,
    campaignTargetAmount,
    campaignTimeline,
    orgId,
  ];

  let campaignId = ethers.solidityPackedKeccak256(
    ["string", "bytes32", "uint256", "uint256", "bytes32"],
    [...campaignData]
  );

  beforeEach(async function () {
    deployer = (await getNamedAccounts()).deployer;
    signer = await ethers.getSigner(deployer);
    fakeDeployer = (await ethers.getSigners())[1].address;
    const decentraAidFactory = await ethers.getContractFactory("DecentraAid");
    decentraAid = await decentraAidFactory.deploy({
      from: deployer,
    });
    await decentraAid.waitForDeployment();
  });

  describe("constructor", () => {
    it("Should initialize correctly", async () => {
      const owner = await decentraAid.owner();
      assert.equal(owner, deployer);
    });
  });

  describe("receive", () => {
    it("Should revert", async () => {
      expect(
        signer.sendTransaction({
          to: decentraAid.target,
          value: ethers.parseEther("0.0000001"),
        })
      ).to.be.reverted;
    });
  });

  //-------------------------Organizations----------------------------

  describe("orgExists", () => {
    let orgId;
    beforeEach(() => {
      orgId = ethers.solidityPackedKeccak256(
        ["string", "bytes32"],
        [orgName, orgDescription]
      );
    });

    it("Should return false if no orgs created", async () => {
      const result = await decentraAid.orgExists(orgId);
      assert.equal(result, false);
    });

    it("Should detect if organization already exists", async () => {
      await decentraAid.createOrganization(...organizationData);
      const result = await decentraAid.orgExists(orgId);
      assert.equal(result, true);
    });
  });

  describe("getOrgIndex", () => {
    it("Should revert if orgId doesnt exist", async () => {
      expect(decentraAid.getOrgIndex(orgId)).to.be.revertedWith(
        "DecentraAid: Organisation does not exist"
      );
    });

    it("Should return correct index", async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);

      const expectedOrgIndex = 0;
      const orgIndex = await decentraAid.getOrgIndex(orgId);

      assert.equal(expectedOrgIndex, orgIndex);
    });
  });

  describe("createOrganization", () => {
    it("Should revert if organization already exists", async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);
      expect(
        decentraAid.createOrganization(...organizationData)
      ).to.be.revertedWith("DecentraAid: Organisation already exist");
    });

    it("Should revert if msg.sender is already an orgCreator", async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);
      expect(
        decentraAid.createOrganization(
          "randomName",
          ethers.encodeBytes32String("randomDescription")
        )
      ).to.be.revertedWith("DecentraAid: Address already owns an organization");
    });

    it("Should emit OrganizationCreated event", async () => {
      expect(decentraAid.createOrganization(...organizationData))
        .to.emit(decentraAid, "OrganizationCreated")
        .withArgs([deployer, orgId, orgName]);
    });

    it("Should create organization correctly", async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);

      const org = await decentraAid.getOrganization(orgId);
      assert.equal(org[0], orgName);
      assert.equal(org[1], orgId);
      assert.equal(org[2], orgDescription);

      const orgIndex = await decentraAid.getOrgIndex(orgId);
      const expectedOrgIndex = 0;
      assert.equal(orgIndex, expectedOrgIndex);

      const orgCreator = await decentraAid.isOrgCreator(deployer);
      const expectedOrgCreator = true;
      assert.equal(orgCreator, expectedOrgCreator);
    });
  });

  //---------------------------Campaigns------------------------------

  describe("campaignExists", () => {
    beforeEach(async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);
    });

    it("Should return false if no campaigns created", async () => {
      const campaignExists = await decentraAid.campaignExists(
        orgId,
        campaignId
      );
      const expectedCampaignExists = false;
      assert.equal(expectedCampaignExists, campaignExists);
    });

    it("Should detect campaign existing", async () => {
      const tx = await decentraAid.addCampaign(...campaignData);
      await tx.wait(1);

      const campaignExists = await decentraAid.campaignExists(
        orgId,
        campaignId
      );
      const expectedCampaignExists = true;
      assert.equal(expectedCampaignExists, campaignExists);
    });
  });

  describe("getCampaignIndex", () => {
    beforeEach(async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);
    });

    it("Should revert if campaign doesnt exist", async () => {
      expect(
        decentraAid.getCampaignIndex(orgId, campaignId)
      ).to.be.revertedWith("DecentraAid: Campaign does not exist");
    });

    it("Should return campaign index", async () => {
      const tx = await decentraAid.addCampaign(...campaignData);
      await tx.wait(1);
      const index = await decentraAid.getCampaignIndex(orgId, campaignId);
      const expectedIndex = 0;
      assert.equal(index, expectedIndex);
    });
  });

  describe("addCampaign", () => {
    beforeEach(async () => {
      const createOrgTx = await decentraAid.createOrganization(
        ...organizationData
      );
      await createOrgTx.wait(1);
    });

    it("Should revert if it isnt orgCreator", async () => {
      expect(
        decentraAid.addCampaign(...campaignData, { from: fakeDeployer })
      ).to.be.revertedWithCustomError(
        decentraAid,
        "DecentraAid__NotOrganizationCreator"
      );
    });

    it("Should emit event CampaignCreated", async () => {
      expect(decentraAid.addCampaign(...campaignData))
        .to.emit(decentraAid, "CampaignCreated")
        .withArgs([orgId, campaignId, campaignName]);
    });

    it("Should revert if campaign already exists", async () => {
      const tx = await decentraAid.addCampaign(...campaignData);
      await tx.wait(1);
      expect(decentraAid.addCampaign(...campaignData)).to.be.revertedWith(
        "DecentraAid: Campaign already exist"
      );
    });

    it("Should create campaign correctly", async () => {
      const tx = await decentraAid.addCampaign(...campaignData);
      await tx.wait(1);

      const campaign = await decentraAid.getCampaign(orgId, campaignId);
      assert.equal(campaign[0], campaignName);
      assert.equal(campaign[1], campaignId);
      assert.equal(campaign[2], campaignDescription);
      assert.equal(campaign[3], campaignTargetAmount);
      assert.equal(campaign[6].toString(), campaignTimeline.toString());

      const campaignIndex = await decentraAid.getCampaignIndex(
        orgId,
        campaignId
      );
      const expectedIndex = 0;
      assert.equal(campaignIndex, expectedIndex);
    });
  });

  describe("contributeToCampaign", () => {
    let amountToDonate = campaignTargetAmount / ethers.toBigInt(2);
    beforeEach(async () => {
      const createOrganizationTx = await decentraAid.createOrganization(
        ...organizationData
      );
      await createOrganizationTx.wait(1);

      const addCampaignTx = await decentraAid.addCampaign(...campaignData);
      await addCampaignTx.wait(1);
    });

    it("Should revert if donation is 0", async () => {
      expect(
        decentraAid.contributeToCampaign(orgId, campaignId)
      ).to.be.revertedWith("DecentralAid: Donation must be above 0");
    });

    it("Should contribute correctly", async () => {
      const tx = await decentraAid.contributeToCampaign(orgId, campaignId, {
        value: amountToDonate,
      });
      await tx.wait(1);

      const donation = await decentraAid.donorsToDonations(
        campaignId,
        deployer
      );
      assert.equal(donation.toString(), amountToDonate.toString());

      const campaign = await decentraAid.getCampaign(orgId, campaignId);
      assert.equal(campaign.totalRaised, amountToDonate);
    });

    it("Should emit NewDonation event", async () => {
      expect(
        decentraAid.contributeToCampaign(orgId, campaignId, {
          value: amountToDonate,
        })
      )
        .to.emit(decentraAid, "NewDonation")
        .withArgs([deployer, amountToDonate, campaignId, orgId]);
    });

    it("Should complete if targetAmount is reached", async () => {
      const tx = await decentraAid.contributeToCampaign(orgId, campaignId, {
        value: campaignTargetAmount,
      });
      await tx.wait(1);

      const campaign = await decentraAid.getCampaign(orgId, campaignId);
      assert.equal(campaign.completed, true);
    });

    it("CampaignCompleted is emitted", async () => {
      const tx1 = await decentraAid.contributeToCampaign(orgId, campaignId, {
        value: amountToDonate,
      });
      await tx1.wait(1);

      expect(
        decentraAid.contributeToCampaign(orgId, campaignId, {
          value: amountToDonate,
        })
      )
        .to.emit(decentraAid, "CampaignCompleted")
        .withArgs([orgId, campaignId]);
    });
  });

  describe("updateTrustScore", () => {
    let newTrustScore = 10;

    beforeEach(async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);
    });

    it("Should update trustScore correctly", async () => {
      const tx = await decentraAid.updateTrustScore(orgId, newTrustScore);
      await tx.wait(1);

      const org = await decentraAid.getOrganization(orgId);
      assert.equal(org.trustScore, newTrustScore);
    });
  });

  describe("updateGracePeriod", () => {
    let newGracePeriod = 60 * 60 * 24 * 10; //10 days

    beforeEach(async () => {
      const tx = await decentraAid.createOrganization(...organizationData);
      await tx.wait(1);
    });

    it("Should update gracePeriod correctly", async () => {
      const tx = await decentraAid.updateGracePeriod(newGracePeriod);
      await tx.wait(1);

      const actualGracePeriod = await decentraAid.gracePeriod();
      assert.equal(actualGracePeriod, newGracePeriod);
    });
  });

  describe("withdrawDonation", () => {
    let newCampaignTimeline, campaignGracePeriod, newCampaignId;
    let amountToDonate = campaignTargetAmount / ethers.toBigInt(2);

    beforeEach(async () => {
      const createOrgTx = await decentraAid.createOrganization(
        ...organizationData
      );
      await createOrgTx.wait(1);

      // The following lines are to update the timeline before every "it" so their order doesnt matter

      let newCampaignData = campaignData;

      let date = new Date();
      let daysForCampaign = 5;
      date.setDate(date.getDate() + daysForCampaign);

      newCampaignTimeline = date.getTime();
      newCampaignData[3] = newCampaignTimeline;

      date.setDate(date.getDate() + daysGracePeriod);
      campaignGracePeriod = date.getTime();

      const addCampaignTx = await decentraAid.addCampaign(...newCampaignData);
      await addCampaignTx.wait(1);

      newCampaignId = ethers.solidityPackedKeccak256(
        ["string", "bytes32", "uint256", "uint256", "bytes32"],
        [...newCampaignData]
      );

      // Then contributing to that new campaign

      const contributeTx = await decentraAid.contributeToCampaign(
        orgId,
        newCampaignId,
        { from: deployer, value: amountToDonate }
      );
      await contributeTx.wait(1);
    });

    it("Should revert if not in gracePeriod", async () => {
      expect(
        decentraAid.withdrawDonation(orgId, newCampaignId)
      ).to.be.revertedWithCustomError(
        decentraAid,
        "DecentraAid__CannotWithdrawOutOfTheGracePeriod"
      );
    });

    it("Should revert if no donation made", async () => {
      expect(
        decentraAid.withdrawDonation(orgId, newCampaignId, {
          from: fakeDeployer,
        })
      ).to.be.revertedWithCustomError(
        decentraAid,
        "DecentraAid__NoDonationsMade"
      );
    });

    it("Should emit WithdrawedDonation", async () => {
      await time.increaseTo(newCampaignTimeline);
      expect(decentraAid.withdrawDonation(orgId, newCampaignId))
        .to.emit(decentraAid, "WithdrawedDonation")
        .withArgs([deployer, amountToDonate, orgId, newCampaignId]);
    });

    it("Should withdraw donation correctly", async () => {
      await time.increaseTo(newCampaignTimeline);

      const tx = await decentraAid.withdrawDonation(orgId, newCampaignId);
      await tx.wait(1);

      const donation = await decentraAid.donorsToDonations(
        newCampaignId,
        deployer
      );
      assert.equal(donation, 0);
    });
  });

  describe("withdrawFunds", () => {
    let newCampaignTimeline, campaignGracePeriod, newCampaignId;
    let amountToDonate = campaignTargetAmount / ethers.toBigInt(2);

    beforeEach(async () => {
      const createOrgTx = await decentraAid.createOrganization(
        ...organizationData
      );
      await createOrgTx.wait(1);

      // The following lines are to update the timeline before every "it" so their order doesnt matter
      //If we dont do this, block.timestamp wont go back for every "it", so we cannot test properly the time dependence

      //For example if we do this first:
      //it("Should withdraw if not completed but past gracePeriod", ()=>{time.incrementTo(timeAfterGracePeriod)})
      //Then when we will do this:
      //it("Should revert if not completed and before gracePeriod", FUNCTION)
      //It will not revert as the time is already after gracePeriod

      //So here we are creating newCampaignData with new campaignTimeline and campaignGracePeriod. Also creating new campaignId for every round

      let newCampaignData = campaignData;

      let date = new Date();
      let daysForCampaign = 5;
      date.setDate(date.getDate() + daysForCampaign);

      newCampaignTimeline = date.getTime();
      newCampaignData[3] = newCampaignTimeline;

      date.setDate(date.getDate() + daysGracePeriod);
      campaignGracePeriod = date.getTime();

      const addCampaignTx = await decentraAid.addCampaign(...newCampaignData);
      await addCampaignTx.wait(1);

      newCampaignId = ethers.solidityPackedKeccak256(
        ["string", "bytes32", "uint256", "uint256", "bytes32"],
        [...newCampaignData]
      );

      // Then contributing to that new campaign

      const contributeTx = await decentraAid.contributeToCampaign(
        orgId,
        newCampaignId,
        { from: deployer, value: amountToDonate }
      );
      await contributeTx.wait(1);
    });

    it("Should revert if its not orgCreator", async () => {
      expect(
        decentraAid.withdrawFunds(orgId, campaignId, { from: fakeDeployer })
      ).to.be.revertedWithCustomError(
        decentraAid,
        "DecentraAid__NotOrganizationCreator"
      );
    });

    it("Should revert if totalRaised is 0", async () => {
      expect(
        decentraAid.withdrawFunds(orgId, campaignId, { from: deployer })
      ).to.be.revertedWithCustomError(
        decentraAid,
        "DecentraAid__NoDonationsMade"
      );
    });

    it("Should revert if campaign not completed and we are still before timeline and gracePeriod finishes", async () => {
      expect(
        decentraAid.withdrawFunds(orgId, newCampaignId)
      ).to.be.revertedWithCustomError(
        decentraAid,
        "DecentraAid__CampaignOngoing"
      );
    });

    it("Should revert if campaign not completed and still before gracePeriod finishes", async () => {
      await time.increaseTo(newCampaignTimeline);

      expect(
        decentraAid.withdrawFunds(orgId, newCampaignId)
      ).to.be.revertedWithCustomError(
        decentraAid,
        "DecentraAid__CampaignOngoing"
      );
    });

    it("Should withdraw if completed even before timeline and gracePeriod finishes", async () => {
      const tx = await decentraAid.contributeToCampaign(orgId, newCampaignId, {
        value: amountToDonate,
      });
      await tx.wait(1);

      const withdrawTx = await decentraAid.withdrawFunds(orgId, newCampaignId);
      await withdrawTx.wait(1);
    });

    it("Should withdraw if not completed but past gracePeriod", async () => {
      await time.increaseTo(campaignGracePeriod);

      const withdrawTx = await decentraAid.withdrawFunds(orgId, newCampaignId);
      await withdrawTx.wait(1);
    });

    it("Should emit WithdrawedFunds", async () => {
      await time.increaseTo(campaignGracePeriod);

      const campaign = await decentraAid.getCampaign(orgId, newCampaignId);

      expect(decentraAid.withdrawFunds(orgId, newCampaignId))
        .to.emit(decentraAid, "WithdrawedFunds")
        .withArgs(campaign.totalRaised, orgId, newCampaignId);
    });

    it("Should withdraw correctly ", async () => {
      await time.increaseTo(campaignGracePeriod);

      const orgCreator = (await decentraAid.getOrganization(orgId))[5];

      const startingBalance = await ethers.provider.getBalance(orgCreator);

      const tx = await decentraAid.withdrawFunds(orgId, newCampaignId);
      await tx.wait(1);

      const endingBalance = await ethers.provider.getBalance(orgCreator);

      expect(endingBalance > startingBalance + amountToDonate);
    });
  });

  describe("verifyOrganization", () => {
    let newBaseScore = 10;
    beforeEach(async () => {
      const createOrgTx = await decentraAid.createOrganization(
        ...organizationData
      );
      await createOrgTx.wait(1);
    });

    it("Should verify correctly", async () => {
      const tx = await decentraAid.verifyOrganization(orgId, newBaseScore);
      await tx.wait(1);

      const org = await decentraAid.getOrganization(orgId);
      assert.equal(org.verified, true);
      assert.equal(org.trustScore, newBaseScore);
    });
  });
});
