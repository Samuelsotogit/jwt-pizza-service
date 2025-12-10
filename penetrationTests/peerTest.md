# Security Assessment Report

**Authors:** Samuel Soto & Jaiden Tripp  
**Date:** December 9, 2025

---

## 1. Self-Attack (Performed by: Samuel Soto)

### **Attack Details**

- **Date Executed:** 12/09/2025
- **Target Website:** `pizza.justachillguy.click`
- **Attack Type:** Broken Access Control
- **Severity:** **3** (High)

### **Description of Result**

An admin account was compromised by tampering with the admin user’s credentials using Burp Suite Repeater.  
The attacker (myself) was able to:

- Change the administrator’s password
- Log in as the admin with the new credentials
- Escalate authorization to administrator level
- Access sensitive administrative functionality
- Acquire significant internal data
- Cause performance impact due to unauthorized administrative access

This demonstrates a _horizontal and vertical privilege escalation_ vulnerability.

### **Evidence / Screenshots**

![loginHacked](../images/loginHacked.png)  
![confirmedHack](../images/hackConfirmed.png)

### **Corrections Made**

Although the attack was successful, it hinges on one assumption:  
**The attacker must know or obtain the admin’s identifying data (email + current password) to authenticate initially.**

Because I had valid admin credentials for testing, I demonstrated that any leak of admin login details would allow a malicious actor to:

- Log in as the admin
- Submit forged requests altering account information
- Lock out the real admin and take over the system

The vulnerability was fixed by ensuring:

- Users can **only update their own account**
- `roles`, `id`, and other sensitive fields are ignored server-side
- Admin privileges cannot be escalated from the client

---

## 2. Attack on Jaiden Tripp

### **Attack Details**

- **Date Executed:** 12/09/2025
- **Target Website:** `JaidensPizzaSite](https://pizza.jaidentrippdevops2025.click/)`
- **Attack Type:** Identification and Authentication Failures
- **Severity:** 2
- **Description of Result:** Customer credentials were impersonated or stolen. Minor performance impacted or specific feature disabled.
- **Evidence / Screenshots:**
  Unavailable due to unfunctional website
- **Corrections Made (if successful):** Suggested stronger passwords as well as hashing and salting to strengthen authentication security flow as well as better alerting on grafana to catch attacks early.

# ** Combined Summary of learnings **

Sometimes the easiest way to find a vulnerability and exploit is by targeting the poor choices of users themselves since they are not developers strictly thinking about security typically. By using the Burp Suite tool 'intruder', one could easily generate a list of common passwords and automatically brute force each of them until access is obtained as it was described in the attack to Jaiden's pizza site.

Another vulnerability that was visible through inspection of the site was the structure of requests, specifically update requests. Some endpoints that update user information on the database do not stricly prohibit additional parameters to be sent on the request body. This allows attackers to test additional parameters which could give them further access to data. An example could be an attacker performing a brute force attack on a user, gaining access to their account, and then using the stolen account to perform attempts at escalating their priviledges to admin.

The first self attack on Samuel Soto's site showed that sensitive data such as jwt tokens would be required by an attacker to escalate priviledges. This places a vital security load on the appropriate storage and nonexposure of jwt tokens.

In conclusion, strong passwords must be created and properly hashed and salted to prevent brute forced attacks. This leaves a shared responsibility with both users and developers. Additionally, developers must ensure that endpoints are created with security in mind, ensuring that only required data persists through each request. Finally, robust security hangs heavily on appropriate hiding of sensitive data such as jwt tokens.

---
